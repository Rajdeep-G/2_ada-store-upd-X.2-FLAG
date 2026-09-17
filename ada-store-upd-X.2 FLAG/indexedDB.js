
const dbName = "ModelDB";
const storeName = "models";

const MODEL_KEY  = "xgboostModel";
const BUFFER_KEY = "replayBuffer";

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
        console.log(`Object store ${storeName} created.`);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) =>
      reject(new Error("Database error: " + (event.target.error?.message ?? "unknown")));
  });
}

// ---------------------------------------------------------------- generic put/get
function put(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    // Resolve on the TRANSACTION, not the request: request.onsuccess fires before
    // the write is durable, so resolving there can race a reload.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("Write failed: " + (tx.error?.message ?? "unknown")));
    tx.onabort = () => reject(new Error("Write aborted: " + (tx.error?.message ?? "unknown")));
  });
}

function get(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(new Error("Read failed: " + (req.error?.message ?? "unknown")));
  });
}

// ---------------------------------------------------------------- model
export async function storeModelInIndexedDB(modelBytes) {
  const bytes =
    modelBytes instanceof Uint8Array ? modelBytes : new Uint8Array(modelBytes);

  if (!bytes.length) throw new Error("Refusing to store an empty model.");

  // Copy: the caller's buffer may be transferred (neutered) right after this.
  const copy = bytes.slice();

  const db = await openDatabase();
  try {
    await put(db, MODEL_KEY, { bytes: copy, savedAt: Date.now() });
    console.log(`Model saved to IndexedDB (${copy.length} bytes).`);
  } finally {
    db.close();
  }
}

export async function loadModelFromIndexedDB() {
  const db = await openDatabase();
  try {
    const rec = await get(db, MODEL_KEY);
    if (!rec) return null;                       // absent is normal, not an error

    // Back-compat: older records stored a Blob under `model`.
    if (rec.model instanceof Blob) {
      const buf = await rec.model.arrayBuffer();
      return buf;
    }
    if (rec.bytes) {
      return rec.bytes.buffer.slice(
        rec.bytes.byteOffset,
        rec.bytes.byteOffset + rec.bytes.byteLength
      );
    }
    return null;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------- replay buffer
export async function saveBufferToIndexedDB(state) {
  if (!state || !state.X || !state.X.length) return;

  const db = await openDatabase();
  try {
    await put(db, BUFFER_KEY, {
      X: state.X,
      y: state.y,
      age: state.age,
      seen: state.seen,
      round: state.round,
      savedAt: Date.now(),
    });
    console.log(`Replay buffer saved (${state.X.length} rows, round ${state.round}).`);
  } finally {
    db.close();
  }
}

export async function loadBufferFromIndexedDB() {
  const db = await openDatabase();
  try {
    const rec = await get(db, BUFFER_KEY);
    if (!rec || !rec.X || !rec.X.length) return null;
    console.log(`Replay buffer restored (${rec.X.length} rows, round ${rec.round}).`);
    return rec;
  } finally {
    db.close();
  }
}

export async function clearStoredState() {
  const db = await openDatabase();
  try {
    await put(db, MODEL_KEY, null);
    await put(db, BUFFER_KEY, null);
    console.log("Cleared stored model and buffer.");
  } finally {
    db.close();
  }
}