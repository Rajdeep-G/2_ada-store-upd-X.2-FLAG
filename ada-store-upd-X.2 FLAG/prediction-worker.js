import { loadPyodide } from "./pyodide/pyodide.mjs";
import * as pyodideModule from './pyodide/pyodide.asm.js';

console.log("Prediction Worker module started");

// ---------------------------------------------------------------- model load
// Prediction prefers IndexedDB — that's the current serving model (base + tail).
// model.json is only the cold-start fallback.
async function loadServingModel() {
  try {
    const mod = await import("./indexedDB.js");
    if (mod && typeof mod.loadModelFromIndexedDB === "function") {
      const dbData = await mod.loadModelFromIndexedDB();
      if (dbData && (dbData.byteLength ?? dbData.length)) {
        console.log("Loaded serving model from IndexedDB");
        return dbData;
      }
    }
  } catch (_) {
    // First run, or helper absent — fall through.
  }

  const response = await fetch("model.json");
  if (!response.ok) {
    throw new Error(`Failed to fetch model.json: ${response.status} ${response.statusText}`);
  }
  console.log("Loaded model from model.json");
  const buf = await response.arrayBuffer();

  try {
    const mod2 = await import("./indexedDB.js");
    if (mod2 && typeof mod2.storeModelInIndexedDB === "function") {
      await mod2.storeModelInIndexedDB(new Uint8Array(buf));
      console.log("Seeded model into IndexedDB from model.json");
    }
  } catch (e) {
    console.warn("Failed to seed model into IndexedDB; continuing in-memory.", e);
  }

  return buf;
}

// ---------------------------------------------------------------- python src
const PY_SRC = `
import numpy as np
import pandas as pd
import xgboost as xgb

booster       = None
FEATURE_NAMES = None
N_FEATURES    = 0


def load_model(model_bytes):
    """(Re)load the serving model. Safe to call repeatedly."""
    global booster, FEATURE_NAMES, N_FEATURES
    raw = model_bytes.to_py() if hasattr(model_bytes, "to_py") else model_bytes
    b = xgb.Booster(model_file=bytearray(raw))
    booster       = b
    FEATURE_NAMES = b.feature_names
    N_FEATURES    = b.num_features()
    return {'n_features': int(N_FEATURES), 'n_trees': int(b.num_boosted_rounds())}


def _make_df(X):
    if FEATURE_NAMES is None:
        return pd.DataFrame(X)
    return pd.DataFrame(X, columns=FEATURE_NAMES)[FEATURE_NAMES]


def predict(input_data):
    if booster is None:
        raise RuntimeError("no model loaded")

    X = np.array(input_data, dtype=float)
    if X.ndim == 1:
        X = X.reshape(1, -1)          # tolerate a single row
    if X.ndim != 2:
        raise ValueError(f"input_data must be 2D, got shape={X.shape}")
    if X.shape[1] != N_FEATURES:
        raise ValueError(f"feature mismatch: got {X.shape[1]}, model expects {N_FEATURES}")

    dmat = xgb.DMatrix(_make_df(X))
    return booster.predict(dmat).tolist()


def model_info():
    if booster is None:
        return {'loaded': False}
    return {
        'loaded':     True,
        'n_features': int(N_FEATURES),
        'n_trees':    int(booster.num_boosted_rounds()),
    }
`;

// ---------------------------------------------------------------- init
let predictFn = null;
let loadModelFn = null;
let modelInfoFn = null;

async function applyModel(bytes) {
  let p = null;
  try {
    p = loadModelFn(bytes);
    const info = p.toJs({ dict_converter: Object.fromEntries });
    console.log("Model active:", info);
    return info;
  } finally {
    if (p) p.destroy();
  }
}

const pyodideReadyPromise = (async () => {
  try {
    console.log("Loading Pyodide...");
    Object.assign(globalThis, pyodideModule);
    self.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
    });

    await self.pyodide.loadPackage(['numpy', 'pandas', 'xgboost']);

    self.pyodide.runPython(PY_SRC);

    // Resolve proxies ONCE — never destroy these.
    predictFn   = self.pyodide.globals.get('predict');
    loadModelFn = self.pyodide.globals.get('load_model');
    modelInfoFn = self.pyodide.globals.get('model_info');
    if (!predictFn) throw new Error('The predict function is not defined in Python');

    const modelData = await loadServingModel();
    await applyModel(new Uint8Array(modelData));

    console.log("Python predict function defined.");
    return self.pyodide;
  } catch (err) {
    console.error("Error during Pyodide initialization:", err);
    throw err;
  }
})();

// ---------------------------------------------------------------- messages
self.onmessage = async (event) => {
  let proxy = null;

  try {
    await pyodideReadyPromise;

    const { type } = event.data || {};

    // Hot-swap the model after a training round, without a page reload.
    if (type === 'reload') {
      const bytes = event.data.model
        ? new Uint8Array(event.data.model)               // bytes passed directly
        : new Uint8Array(await loadServingModel());      // else re-read IndexedDB
      const info = await applyModel(bytes);
      self.postMessage({ reloaded: true, info });
      return true;
    }

    if (type === 'info') {
      const p = modelInfoFn();
      const info = p.toJs({ dict_converter: Object.fromEntries });
      p.destroy();
      self.postMessage({ info });
      return true;
    }

    const inputData = event.data.input;
    if (!inputData) throw new Error("No input data provided");

    proxy = predictFn(inputData);
    const prediction = proxy.toJs();
    proxy.destroy();
    proxy = null;

    self.postMessage({ data: prediction });
    return true;

  } catch (error) {
    console.error("Worker error:", error);
    self.postMessage({ error: error?.message || String(error) });
    return false;
  } finally {
    if (proxy) proxy.destroy();   // release on the error path too
  }
};