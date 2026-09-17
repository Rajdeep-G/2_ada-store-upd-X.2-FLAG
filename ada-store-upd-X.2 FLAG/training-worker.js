import { loadPyodide } from "./pyodide/pyodide.mjs";
import * as pyodideModule from './pyodide/pyodide.asm.js';

console.log("Training Worker module started (incremental fine-tuning)");

// ---------------------------------------------------------------- persistence
// Incremental mode: the starting point for THIS round is the model that
// resulted from the LAST round, not the frozen base. So on worker startup,
// check IndexedDB first (whatever the page last stored after a training
// round) and only fall back to model.json on a true cold start.
async function loadCurrentModel() {
  try {
    const mod = await import("./indexedDB.js");
    if (mod && typeof mod.loadModelFromIndexedDB === "function") {
      const dbData = await mod.loadModelFromIndexedDB();
      if (dbData && (dbData.byteLength ?? dbData.length)) {
        console.log("Resuming from stored model in IndexedDB");
        return dbData;
      }
    }
  } catch (_) { /* first run, or helper absent — fall through */ }

  const response = await fetch("model.json");
  if (!response.ok) {
    throw new Error(`Failed to fetch model.json: ${response.status} ${response.statusText}`);
  }
  console.log("Cold start: loaded base model from model.json");
  return response.arrayBuffer();
}

// ---------------------------------------------------------------- python src
const PY_SRC = `
import numpy as np
import pandas as pd
import xgboost as xgb

MIN_ROWS          = 0   # per-round floor. Skip the round if fewer labeled rows than this.
MAX_TOTAL_ROUNDS  = 500   # soft cap — warn only, doesn't block. Watch this over time.


_CONFIG_TIERS = [
    # (min_batch_size, rounds, min_child_weight)
    (90, 12, 3),
    (60, 10, 3),
    (30,  8, 2),
    (0,   6, 2),
]

def _dynamic_config(n):
    for threshold, rounds, mcw in _CONFIG_TIERS:
        if n >= threshold:
            return rounds, mcw
    return _CONFIG_TIERS[-1][1], _CONFIG_TIERS[-1][2]   # unreachable safety net


def _make_params(min_child_weight):
    return {
        'objective':        'binary:logistic',
        'eval_metric':      'logloss',
        'tree_method':      'hist',
        'nthread':          1,
        'learning_rate':    0.05,
        'max_depth':        3,
        'min_child_weight': min_child_weight,
        'reg_lambda':       3.0,
        'subsample':        1.0,
        'colsample_bytree': 1.0,
        'base_score':       0.5,
    }

_raw = current_model_bytes.to_py() if hasattr(current_model_bytes, "to_py") else current_model_bytes
CURRENT_BYTES = bytearray(_raw)

_probe = xgb.Booster(model_file=CURRENT_BYTES)
FEATURE_NAMES = _probe.feature_names
N_FEATURES    = _probe.num_features()
_total_trees  = int(_probe.num_boosted_rounds())
del _probe, _raw

_round         = 0
_last_pos_rate = None
_last_batch_n  = 0
_last_rounds   = None
_last_mcw      = None


def _make_df(X):
    if FEATURE_NAMES is None:
        return pd.DataFrame(X)
    return pd.DataFrame(X, columns=FEATURE_NAMES)[FEATURE_NAMES]


def train(input_data, result_data, num_boost_round=None):
    """One call per round. Fine-tunes ON TOP of the current model using only
    this round's batch — no history buffer, no retrain-from-base. Returns
    updated model bytes, or None if the round was skipped (too few rows,
    or every label in the batch was the same class)."""
    global _round, CURRENT_BYTES, _total_trees, _last_pos_rate, _last_batch_n
    global _last_rounds, _last_mcw

    X = np.array(input_data, dtype=float)
    y = np.array(result_data, dtype=float).reshape(-1)

    if X.ndim != 2:
        raise ValueError(f"input_data must be 2D, got shape={X.shape}")
    if X.shape[0] != y.shape[0]:
        raise ValueError(f"row mismatch: X has {X.shape[0]} rows, y has {y.shape[0]}")
    if X.shape[1] != N_FEATURES:
        raise ValueError(f"feature mismatch: got {X.shape[1]}, model expects {N_FEATURES}")

    _last_batch_n = int(X.shape[0])

    if X.shape[0] < MIN_ROWS or np.unique(y).size < 0:
        return None    # skipped: not enough signal in THIS batch

    _round += 1
    _last_pos_rate = float(y.mean())

    dtrain = xgb.DMatrix(_make_df(X), label=y)

    dyn_rounds, dyn_mcw = _dynamic_config(X.shape[0])
    rounds = int(num_boost_round) if num_boost_round else dyn_rounds
    rounds = max(1, rounds)
    _last_rounds = rounds
    _last_mcw    = dyn_mcw

    params = _make_params(dyn_mcw)

    # Continue from the CURRENT model (last round's result) — not the base.
    booster = xgb.Booster(model_file=CURRENT_BYTES)
    booster = xgb.train(params, dtrain, num_boost_round=rounds, xgb_model=booster)

    CURRENT_BYTES = bytearray(booster.save_raw())
    _total_trees  = int(booster.num_boosted_rounds())

    if _total_trees > MAX_TOTAL_ROUNDS:
        print(f"[warn] model has grown to {_total_trees} trees — consider a periodic reset to a fresh checkpoint")

    return CURRENT_BYTES


def training_stats():
    return {
        'round':               int(_round),
        'total_trees':         int(_total_trees),
        'last_batch_n':        int(_last_batch_n),
        'last_pos_rate':       _last_pos_rate,
        'last_rounds_used':    _last_rounds,
        'last_min_child_wt':   _last_mcw,
    }
`;

// ---------------------------------------------------------------- init
let trainFn = null;
let statsFn = null;

let pyodideReadyPromise = (async () => {
  try {
    console.log("Loading Pyodide...");
    Object.assign(globalThis, pyodideModule);
    self.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
    });

    console.log("Pyodide loaded, loading packages...");
    await self.pyodide.loadPackage(['numpy', 'pandas', 'xgboost']);
    console.log("Packages loaded");

    const modelBuf = await loadCurrentModel();
    const modelBytes = new Uint8Array(modelBuf);
    console.log(`Starting model loaded: ${modelBytes.length} bytes`);

    // Pass bytes by reference — no string interpolation, no eval-per-byte.
    self.pyodide.globals.set("current_model_bytes", modelBytes);
    self.pyodide.runPython(PY_SRC);

    // Resolve proxies ONCE. Destroying these per-message breaks every later round.
    trainFn = self.pyodide.globals.get('train');
    statsFn = self.pyodide.globals.get('training_stats');
    if (!trainFn) throw new Error('The train function is not defined in Python');

    console.log("Python train function defined (incremental mode).");
    return self.pyodide;
  } catch (err) {
    console.error("Error during Pyodide initialization:", err);
    throw err;
  }
})();

// ---------------------------------------------------------------- messages
self.onmessage = async (event) => {
  let proxy = null;
  let statsProxy = null;

  try {
    await pyodideReadyPromise;

    const inputData = event.data.input;
    const resultData = event.data.result;
    if (!inputData || !resultData) {
      throw new Error("No input or result data provided");
    }

    proxy = trainFn(inputData, resultData);

    if (proxy === null || proxy === undefined) {
      // Skipped: this round's batch was too small or single-class. Not an error.
      statsProxy = statsFn();
      const stats = statsProxy.toJs({ dict_converter: Object.fromEntries });
      console.log("Round skipped (insufficient signal in this batch):", stats);
      self.postMessage({ skipped: true, stats });
      return true;
    }

    const bytes = proxy.toJs();            // Uint8Array from save_raw()
    proxy.destroy();
    proxy = null;

    statsProxy = statsFn();
    const stats = statsProxy.toJs({ dict_converter: Object.fromEntries });
    statsProxy.destroy();
    statsProxy = null;
    console.log("Model updated (incremental):", stats);

    // No buffer to persist in incremental mode — the page script already
    // stores the returned bytes to IndexedDB, which is what the next
    // worker startup (loadCurrentModel) will resume from.

    const uint8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    self.postMessage({ data: uint8.buffer, stats }, [uint8.buffer]);
    return true;

  } catch (error) {
    console.error("Error during Training", error);
    self.postMessage({ error: error?.message || String(error) });
    return false;
  } finally {
    // Proxies must be released even on the error path or the WASM heap leaks.
    if (proxy) proxy.destroy();
    if (statsProxy) statsProxy.destroy();
  }
};