export const SOLVE_TRANSCRIPT_DATABASE_NAME = "sudoku-pilot-solve-transcripts";
export const SOLVE_TRANSCRIPT_DATABASE_VERSION = 1;
export const SOLVE_TRANSCRIPT_SCHEMA_VERSION = 1;
export const SOLVE_TRANSCRIPT_CODEC_VERSION = 1;
export const SOLVE_TRANSCRIPT_ANALYZER_VERSION = 1;
export const SOLVE_TRANSCRIPT_MAX_RUNS = 100;
export const SOLVE_TRANSCRIPT_RETENTION_DAYS = 90;

export const SOLVE_ACTION_CODES = Object.freeze({
  manualEntry: 0,
  erase: 1,
  undo: 2,
  hintApply: 3,
  automation: 4,
  resumeReconcile: 5
});

const ASSISTANCE_CODES = Object.freeze({
  none: 0,
  tool: 1,
  "search-focus": 2,
  "structural-location": 3,
  "exact-move": 4
});

export function createMemorySolveTranscriptStorage() {
  const runs = new Map();
  return createStorageApi({
    async put(run) {
      runs.set(run.runId, clone(run));
    },
    async get(runId) {
      return clone(runs.get(runId) || null);
    },
    async list() {
      return [...runs.values()].map(clone);
    },
    async delete(runId) {
      runs.delete(runId);
    },
    async clear() {
      runs.clear();
    }
  });
}

export async function openSolveTranscriptStorage({
  indexedDB = globalThis.indexedDB,
  databaseName = SOLVE_TRANSCRIPT_DATABASE_NAME
} = {}) {
  if (!indexedDB) throw new Error("IndexedDB is unavailable; solve transcripts cannot open.");
  const database = await openDatabase(indexedDB, databaseName);
  return createStorageApi({
    put: (run) => idbRequest(database, "runs", "readwrite", (store) => store.put(clone(run))),
    get: (runId) => idbRequest(database, "runs", "readonly", (store) => store.get(runId)),
    list: () => idbRequest(database, "runs", "readonly", (store) => store.getAll()),
    delete: (runId) => idbRequest(database, "runs", "readwrite", (store) => store.delete(runId)),
    clear: () => idbRequest(database, "runs", "readwrite", (store) => store.clear()),
    close: () => database.close()
  });
}

export function createSolveTranscriptManager({
  storage,
  now = () => new Date(),
  idFactory = defaultRunId,
  maxRuns = SOLVE_TRANSCRIPT_MAX_RUNS,
  retentionDays = SOLVE_TRANSCRIPT_RETENTION_DAYS
} = {}) {
  if (!storage) throw new Error("Solve transcript storage is required.");

  async function startRun({
    source,
    difficulty = null,
    canonicalPuzzleId = null,
    sourceId = null,
    puzzle
  } = {}) {
    if (!source || !puzzle) throw new Error("A solve transcript needs a source and initial puzzle.");
    const timestamp = currentIso(now);
    const run = {
      runId: idFactory({ source, timestamp }),
      schemaVersion: SOLVE_TRANSCRIPT_SCHEMA_VERSION,
      codecVersion: SOLVE_TRANSCRIPT_CODEC_VERSION,
      analyzerVersion: SOLVE_TRANSCRIPT_ANALYZER_VERSION,
      storageScope: "local-only",
      containsPuzzleContent: true,
      source,
      difficulty,
      canonicalPuzzleId,
      sourceId,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      terminalStatus: null,
      initialValues: encodeValues(puzzle.values),
      initialEliminations: encodeEliminations(puzzle.eliminated),
      techniqueTable: [],
      events: []
    };
    validateRun(run);
    await storage.putRun(run);
    await prune();
    return clone(run);
  }

  async function appendTransition(runId, input = {}) {
    const run = await storage.getRun(runId);
    if (!run || run.completedAt) return run;
    const next = appendSolveTransition(run, input, { now: currentIso(now) });
    await storage.putRun(next);
    return clone(next);
  }

  async function completeRun(runId, terminalStatus = "completed") {
    const run = await storage.getRun(runId);
    if (!run || run.completedAt) return run;
    const timestamp = currentIso(now);
    const completed = {
      ...run,
      completedAt: timestamp,
      updatedAt: timestamp,
      terminalStatus
    };
    validateRun(completed);
    await storage.putRun(completed);
    await prune();
    return clone(completed);
  }

  async function prune() {
    const runs = await storage.listRuns();
    const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
    const expired = runs
      .filter((run) => run.completedAt && new Date(run.completedAt).getTime() < cutoff)
      .map((run) => run.runId);
    for (const runId of expired) await storage.deleteRun(runId);
    const remaining = (await storage.listRuns())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    for (const run of remaining.slice(maxRuns)) await storage.deleteRun(run.runId);
  }

  return Object.freeze({
    startRun,
    appendTransition,
    completeRun,
    getRun: storage.getRun,
    listRuns: storage.listRuns,
    async summary() {
      const runs = await storage.listRuns();
      return {
        runCount: runs.length,
        completedCount: runs.filter((run) => run.completedAt).length,
        approximateBytes: runs.reduce((total, run) => total + estimateSolveRunBytes(run), 0),
        maxRuns,
        retentionDays
      };
    },
    async exportData() {
      return {
        schemaVersion: SOLVE_TRANSCRIPT_SCHEMA_VERSION,
        storageScope: "local-only",
        containsPuzzleContent: true,
        warning: "This export contains starting grids and exact solve actions.",
        runs: (await storage.listRuns()).sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      };
    },
    clearAll: storage.clearAll,
    prune,
    close: storage.close
  });
}

export function appendSolveTransition(run, {
  action,
  before,
  after,
  elapsedMs = 0,
  techniqueId = null,
  observedTechniqueId = null,
  assistanceLevel = "none"
} = {}, { now = new Date().toISOString() } = {}) {
  validateRun(run);
  if (!(action in SOLVE_ACTION_CODES)) throw new Error(`Unknown solve transcript action: ${action}`);
  if (!(assistanceLevel in ASSISTANCE_CODES)) throw new Error(`Unknown solve transcript assistance: ${assistanceLevel}`);
  const valuePatches = diffValues(before?.values, after?.values);
  const { added, removed } = diffEliminations(before?.eliminated, after?.eliminated);
  if (action === "resumeReconcile" && !valuePatches.length && !added.length && !removed.length) return run;
  const techniqueTable = [...run.techniqueTable];
  const techniqueRef = techniqueReference(techniqueTable, techniqueId);
  const observedTechniqueRef = techniqueReference(techniqueTable, observedTechniqueId);
  const event = [
    run.events.length,
    Math.max(0, Math.round(Number(elapsedMs) || 0)),
    SOLVE_ACTION_CODES[action],
    valuePatches,
    added,
    removed,
    techniqueRef,
    observedTechniqueRef,
    ASSISTANCE_CODES[assistanceLevel]
  ];
  const next = {
    ...run,
    updatedAt: typeof now === "string" ? now : new Date(now).toISOString(),
    techniqueTable,
    events: [...run.events, event]
  };
  validateRun(next);
  return next;
}

export function replaySolveRun(run) {
  validateRun(run);
  const values = decodeValues(run.initialValues);
  const eliminated = decodeEliminations(run.initialEliminations);
  for (const event of run.events) {
    applyPairs(values, event[3]);
    applyEliminationPairs(eliminated, event[4], true);
    applyEliminationPairs(eliminated, event[5], false);
  }
  return { values, eliminated };
}

export function estimateSolveRunBytes(run) {
  return new TextEncoder().encode(JSON.stringify(run)).length;
}

function createStorageApi(adapter) {
  return Object.freeze({
    putRun: adapter.put,
    getRun: adapter.get,
    async listRuns() {
      return (await adapter.list()).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    },
    deleteRun: adapter.delete,
    clearAll: adapter.clear,
    close: adapter.close || (() => {})
  });
}

function encodeValues(values) {
  if (!Array.isArray(values) || values.length !== 81) throw new Error("Solve transcript values must contain 81 cells.");
  return values.map((value) => Math.max(0, Math.min(9, Number(value) || 0))).join("");
}

function decodeValues(encoded) {
  if (typeof encoded !== "string" || encoded.length !== 81) throw new Error("Invalid solve transcript initial values.");
  return [...encoded].map(Number);
}

function encodeEliminations(eliminated = []) {
  const encoded = [];
  for (let cell = 0; cell < 81; cell += 1) {
    for (const digit of eliminated[cell] || []) encoded.push(cell, digit);
  }
  return encoded;
}

function decodeEliminations(encoded = []) {
  const eliminated = Array.from({ length: 81 }, () => new Set());
  applyEliminationPairs(eliminated, encoded, true);
  return eliminated;
}

function diffValues(before = [], after = []) {
  const patches = [];
  for (let cell = 0; cell < 81; cell += 1) {
    const previous = Number(before[cell]) || 0;
    const next = Number(after[cell]) || 0;
    if (previous !== next) patches.push(cell, next);
  }
  return patches;
}

function diffEliminations(before = [], after = []) {
  const added = [];
  const removed = [];
  for (let cell = 0; cell < 81; cell += 1) {
    const previous = before[cell] || new Set();
    const next = after[cell] || new Set();
    for (const digit of next) if (!previous.has(digit)) added.push(cell, digit);
    for (const digit of previous) if (!next.has(digit)) removed.push(cell, digit);
  }
  return { added, removed };
}

function techniqueReference(table, techniqueId) {
  if (!techniqueId) return -1;
  let index = table.indexOf(techniqueId);
  if (index === -1) {
    table.push(techniqueId);
    index = table.length - 1;
  }
  return index;
}

function applyPairs(values, pairs = []) {
  for (let index = 0; index < pairs.length; index += 2) values[pairs[index]] = pairs[index + 1];
}

function applyEliminationPairs(eliminated, pairs = [], add) {
  for (let index = 0; index < pairs.length; index += 2) {
    const cell = pairs[index];
    const digit = pairs[index + 1];
    if (add) eliminated[cell].add(digit);
    else eliminated[cell].delete(digit);
  }
}

function validateRun(run) {
  if (!run?.runId || run.schemaVersion !== SOLVE_TRANSCRIPT_SCHEMA_VERSION) throw new Error("Invalid solve transcript.");
  if (run.codecVersion !== SOLVE_TRANSCRIPT_CODEC_VERSION) throw new Error("Unsupported solve transcript codec.");
  decodeValues(run.initialValues);
  if (!Array.isArray(run.initialEliminations) || !Array.isArray(run.techniqueTable) || !Array.isArray(run.events)) {
    throw new Error("Invalid solve transcript payload.");
  }
  return true;
}

function openDatabase(indexedDB, databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, SOLVE_TRANSCRIPT_DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("runs")) {
        const store = request.result.createObjectStore("runs", { keyPath: "runId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("completedAt", "completedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function idbRequest(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(clone(request.result ?? null));
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(transaction.error || new Error("Solve transcript transaction aborted."));
  });
}

function currentIso(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Solve transcript time must be valid.");
  return date.toISOString();
}

function defaultRunId({ source, timestamp }) {
  const suffix = globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2);
  return `solve-${source}-${timestamp}-${suffix}`;
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
