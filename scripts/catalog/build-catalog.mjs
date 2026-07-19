import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { getSudoku } from "sudoku-gen";
import { certifyPuzzle, DIFFICULTY_ORDER, findGenuinelyRequiredTechniques, ratePuzzle } from "../../src/difficulty.js";
import { ALL_TECHNIQUES } from "../../src/puzzles.js";
import { EXTREME_BASES } from "./extreme-bases.mjs";

const ROOT = new URL("../../", import.meta.url);
const options = parseOptions(process.argv.slice(2));
const stateUrl = new URL(options.state, ROOT);
const shardUrl = new URL("src/catalog/", ROOT);
const auditUrl = new URL("output/catalog-audit.json", ROOT);

if (options.reset) await rm(stateUrl, { force: true });
await mkdir(new URL("./", stateUrl), { recursive: true });
await mkdir(shardUrl, { recursive: true });
await mkdir(new URL("output/", ROOT), { recursive: true });

const db = new DatabaseSync(stateUrl.pathname);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
createSchema(db);
seedProvenance(db);

if (!options.compileOnly) {
  for (const level of DIFFICULTY_ORDER) await collectLevel(level, level === "extreme" ? options.extremePool : options.pool);
  const selected = selectBalancedCandidates(db, options.target);
  const canonicalized = await canonicalizeInParallel(selected);
  persistCanonicalResults(db, canonicalized, options.target);
}
const audit = await compileShardsAndAudit(db, options.target);
await writeFile(auditUrl, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ state: stateUrl.pathname, audit: auditUrl.pathname, counts: audit.catalog.counts }, null, 2));
db.close();

async function collectLevel(level, poolTarget) {
  let eligible = eligibleCount(level);
  let attempts = 0;
  const maxAttempts = poolTarget * (level === "extreme" ? 80 : 30);
  while (eligible < poolTarget && attempts < maxAttempts) {
    attempts += 1;
    const candidate = nextCandidate(level);
    const inserted = db.prepare(`INSERT OR IGNORE INTO candidates
      (grid, solution, requested_level, producer, producer_version, configuration, provenance_id, parent_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`).run(
      candidate.grid, candidate.solution, level, candidate.producer, candidate.version,
      JSON.stringify(candidate.configuration), candidate.provenanceId, candidate.parentId || null
    );
    if (!inserted.changes) continue;
    const id = Number(inserted.lastInsertRowid);
    const evaluation = evaluateCandidate(candidate.grid, candidate.solution, level);
    db.prepare(`UPDATE candidates SET status=?, rejection_reason=?, rated_level=?, clue_count=?, step_count=?,
      technique_metadata=?, required_techniques=?, solution=?, full_trace=? WHERE id=?`).run(
      evaluation.status,
      evaluation.reason,
      evaluation.rating?.level || null,
      evaluation.clueCount,
      evaluation.rating?.steps || null,
      JSON.stringify(evaluation.rating?.techniqueCounts || {}),
      JSON.stringify(evaluation.requiredTechniques || []),
      evaluation.solution || candidate.solution,
      JSON.stringify(evaluation.rating?.trace || []),
      id
    );
    if (evaluation.status === "eligible") eligible += 1;
    if (attempts % 25 === 0 || eligible === poolTarget) console.log(`${level}: ${eligible}/${poolTarget} eligible (${attempts} new attempts)`);
  }
  if (eligible < poolTarget) throw new Error(`${level} produced only ${eligible}/${poolTarget} eligible candidates after ${attempts} attempts.`);
}

function nextCandidate(level) {
  const cursor = incrementState(`cursor:${level}`) - 1;
  const acceptedBases = db.prepare(`SELECT c.id, c.grid, c.solution, c.canonical_id
    FROM accepted a JOIN candidates c ON c.id=a.candidate_id
    WHERE a.difficulty=? ORDER BY c.canonical_id`).all(level);
  if (acceptedBases.length) {
    const base = acceptedBases[cursor % acceptedBases.length];
    const round = Math.floor(cursor / acceptedBases.length);
    const blanks = [...base.grid].flatMap((cell, index) => cell === "0" ? [index] : []);
    const additions = combinationFor(round, blanks);
    const cells = [...base.grid];
    for (const index of additions) cells[index] = base.solution[index];
    return {
      grid: cells.join(""),
      solution: base.solution,
      producer: level === "extreme" ? "sudoku-pilot-extreme-augmentation" : "sudoku-pilot-clue-augmentation",
      version: "1",
      provenanceId: level === "extreme" ? "local:sudoku-pilot-extreme@1" : "local:sudoku-pilot-augmentation@1",
      parentId: `candidate:${base.id}`,
      configuration: { additions, baseCanonicalId: base.canonical_id, method: "add-solution-clues" }
    };
  }

  if (level === "extreme") {
    const base = EXTREME_BASES[cursor % EXTREME_BASES.length];
    const round = Math.floor(cursor / EXTREME_BASES.length);
    const repairs = distributionRepairs(base.grid);
    const blanks = [...base.grid].flatMap((cell, index) => cell === "0" && !repairs.includes(index) ? [index] : []);
    const additions = combinationFor(round, blanks);
    const cells = [...base.grid];
    for (const index of [...repairs, ...additions]) cells[index] = base.solution[index];
    return {
      grid: cells.join(""),
      solution: base.solution,
      producer: "sudoku-pilot-extreme-augmentation",
      version: "1",
      provenanceId: "local:sudoku-pilot-extreme@1",
      configuration: { additions, distributionRepairs: repairs, method: "add-solution-clues" }
    };
  }

  const sourceLevels = level === "hard" ? ["hard", "expert"] : level === "expert" ? ["expert", "hard"] : [level];
  const sourceLevel = sourceLevels[cursor % sourceLevels.length];
  const generated = getSudoku(sourceLevel);
  return {
    grid: generated.puzzle.replace(/-/g, "0"),
    solution: generated.solution,
    producer: "sudoku-gen",
    version: "1.0.2",
    provenanceId: "npm:sudoku-gen@1.0.2",
    configuration: { sourceDifficulty: sourceLevel }
  };
}

function evaluateCandidate(grid, suppliedSolution, requestedLevel) {
  const clueCount = [...grid].filter((cell) => cell !== "0").length;
  const certification = certifyPuzzle(grid);
  const rating = certification.rating;
  if (!certification.certified) return { status: "rejected", reason: certification.reason, rating, clueCount };
  if (rating.level !== requestedLevel) return { status: "rejected", reason: `difficulty-mismatch:${rating.level}`, rating, clueCount };
  if (rating.solutionCount !== 1) return { status: "rejected", reason: "not-unique", rating, clueCount };
  const solution = rating.solution.join("");
  if (suppliedSolution && suppliedSolution.replace(/[^1-9]/g, "") !== solution) return { status: "rejected", reason: "solution-mismatch", rating, clueCount };
  if (clueCount < 17 || clueCount > 45) return { status: "rejected", reason: "clue-count-out-of-range", rating, clueCount };
  if (rating.steps < 1 || rating.steps > 200) return { status: "rejected", reason: "step-count-out-of-range", rating, clueCount };
  if (!hasReasonableDistribution(grid)) return { status: "rejected", reason: "empty-row-column-or-box", rating, clueCount };

  const repeat = ratePuzzle(grid);
  const stableFields = (value) => JSON.stringify([value.status, value.level, value.solutionCount, value.steps, value.hardestTechnique, value.techniqueCounts, value.solution]);
  if (stableFields(rating) !== stableFields(repeat)) return { status: "rejected", reason: "unstable-rating", rating, clueCount };
  return { status: "eligible", reason: null, rating, clueCount, solution, requiredTechniques: findGenuinelyRequiredTechniques(grid) };
}

function selectBalancedCandidates(database, target) {
  const rows = database.prepare("SELECT * FROM candidates WHERE status IN ('eligible','selected','accepted','coverage-not-selected') ORDER BY id").all();
  const selected = [];
  for (const level of DIFFICULTY_ORDER) {
    const pool = rows.filter((row) => row.requested_level === level).map(decodeCandidate).map((candidate) => ({ ...candidate, coverageFeatures: coverageFeatures(candidate) }));
    const levelSelected = [];
    const featureCounts = new Map();
    const selectionTarget = Math.min(pool.length, target + 100);
    while (levelSelected.length < selectionTarget && pool.length) {
      let bestIndex = 0;
      let bestScore = -1;
      for (let index = 0; index < pool.length; index += 1) {
        const score = pool[index].coverageFeatures.reduce((sum, feature) => sum + 1 / (1 + (featureCounts.get(feature) || 0)), 0);
        if (score > bestScore || (score === bestScore && pool[index].id < pool[bestIndex].id)) { bestIndex = index; bestScore = score; }
      }
      const [chosen] = pool.splice(bestIndex, 1);
      levelSelected.push(chosen);
      for (const feature of chosen.coverageFeatures) featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1);
    }
    if (levelSelected.length < target) throw new Error(`Only ${levelSelected.length}/${target} ${level} candidates were available for balanced selection.`);
    selected.push(...levelSelected);
  }
  return selected;
}

function coverageFeatures(candidate) {
  const used = Object.keys(candidate.techniqueMetadata);
  const cells = [...candidate.grid];
  const firstBandMask = cells.slice(0, 27).map((cell) => cell === "0" ? "0" : "1").join("");
  const features = [
    `clues:${Math.floor(candidate.clueCount / 3)}`,
    `steps:${Math.floor(candidate.stepCount / 5)}`,
    `opening:${firstBandMask}`
  ];
  if (candidate.requestedLevel === "hard") {
    const pointing = used.includes("Pointing Candidates");
    const claiming = used.includes("Claiming Candidates");
    features.push(`locked:${pointing && claiming ? "mixed" : pointing ? "pointing" : "claiming"}`);
  }
  if (["expert", "extreme"].includes(candidate.requestedLevel)) features.push(...used.map((technique) => `technique:${technique}`));
  return features;
}

async function canonicalizeInParallel(candidates) {
  const results = candidates.map((candidate) => candidate.canonicalId ? {
    ...candidate,
    canonicalId: candidate.canonicalId,
    canonicalGrid: candidate.canonicalGrid
  } : null);
  const pending = candidates.flatMap((candidate, index) => candidate.canonicalId ? [] : [{ candidate, index }]);
  if (!pending.length) return results;
  const workerCount = Math.min(4, availableParallelism(), pending.length);
  const workers = Array.from({ length: workerCount }, () => new Worker(new URL("./canonical-worker.mjs", import.meta.url)));
  let cursor = 0;
  let completed = candidates.length - pending.length;
  return new Promise((resolve, reject) => {
    const dispatch = (worker) => {
      if (cursor >= pending.length) return;
      const { index, candidate } = pending[cursor++];
      worker.postMessage({ index, grid: candidate.grid });
    };
    for (const worker of workers) {
      worker.on("message", (result) => {
        results[result.index] = { ...candidates[result.index], ...result };
        db.prepare("UPDATE candidates SET canonical_id=?, canonical_grid=? WHERE id=?").run(
          result.canonicalId, result.canonicalGrid, candidates[result.index].id
        );
        completed += 1;
        if (completed % 25 === 0 || completed === candidates.length) console.log(`canonicalized ${completed}/${candidates.length}`);
        if (completed === candidates.length) {
          Promise.all(workers.map((item) => item.terminate())).then(() => resolve(results), reject);
        } else dispatch(worker);
      });
      worker.on("error", reject);
      dispatch(worker);
    }
  });
}

function persistCanonicalResults(database, candidates, target) {
  database.exec("DELETE FROM accepted; UPDATE candidates SET status='coverage-not-selected' WHERE status IN ('selected','accepted');");
  const seen = new Set();
  const counts = Object.fromEntries(DIFFICULTY_ORDER.map((level) => [level, 0]));
  for (const candidate of candidates) {
    database.prepare("UPDATE candidates SET canonical_id=?, canonical_grid=? WHERE id=?").run(candidate.canonicalId, candidate.canonicalGrid, candidate.id);
    if (seen.has(candidate.canonicalId) || database.prepare("SELECT 1 FROM accepted WHERE canonical_id=?").get(candidate.canonicalId)) {
      database.prepare("UPDATE candidates SET status='rejected', rejection_reason='canonical-duplicate' WHERE id=?").run(candidate.id);
      continue;
    }
    if (counts[candidate.requestedLevel] >= target) continue;
    seen.add(candidate.canonicalId);
    counts[candidate.requestedLevel] += 1;
    database.prepare(`INSERT INTO accepted
      (canonical_id, canonical_grid, candidate_id, difficulty, accepted_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(
      candidate.canonicalId, candidate.canonicalGrid, candidate.id, candidate.requestedLevel
    );
    database.prepare("UPDATE candidates SET status='accepted', rejection_reason=NULL WHERE id=?").run(candidate.id);
  }
  for (const [level, count] of Object.entries(counts)) if (count !== target) throw new Error(`${level} canonical selection produced ${count}/${target}. Increase --pool and resume.`);
}

async function compileShardsAndAudit(database, target) {
  const accepted = database.prepare(`SELECT c.*, a.canonical_id FROM accepted a JOIN candidates c ON c.id=a.candidate_id
    ORDER BY a.difficulty, a.canonical_id`).all().map(decodeCandidate);
  const counts = {};
  const techniques = {};
  const requiredTechniques = {};
  const sizes = {};
  const gaps = [];
  for (const level of DIFFICULTY_ORDER) {
    const rows = accepted.filter((row) => row.requestedLevel === level);
    counts[level] = rows.length;
    const compact = rows.map((row) => ({
      id: row.canonicalId,
      grid: row.grid,
      solution: row.solution,
      level,
      techniques: Object.keys(row.techniqueMetadata),
      required: row.requiredTechniques,
      steps: row.stepCount,
      provenance: row.provenanceId
    }));
    const json = `${JSON.stringify(compact)}\n`;
    await writeFile(new URL(`${level}.json`, shardUrl), json);
    sizes[level] = { bytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).byteLength };
    techniques[level] = countTechniques(compact);
    requiredTechniques[level] = countRequiredTechniques(compact);
  }
  const desired = {
    hard: ["Pointing Candidates", "Claiming Candidates"],
    expert: ["Naked Pair", "Hidden Pair", "Naked Triple", "Hidden Triple", "Naked Quadruple", "Hidden Quadruple"],
    extreme: ["X-Wing", "Swordfish", "Jellyfish", "Skyscraper", "2-String Kite", "Crane", "XY-Wing", "XYZ-Wing", "W-Wing", "Simple Colouring", "Empty Rectangle"]
  };
  for (const [level, list] of Object.entries(desired)) {
    for (const technique of list) {
      const actual = techniques[level][technique] || 0;
      if (!actual) gaps.push({ level, technique, target: 1, actual, shortage: 1 });
    }
  }
  const hardLockedCoverage = lockedCoverage(accepted.filter((row) => row.requestedLevel === "hard"));
  if (!hardLockedCoverage.claimingOnly) gaps.push({ level: "hard", technique: "Claiming Candidates without Pointing Candidates", target: 1, actual: 0, shortage: 1 });
  const statuses = Object.fromEntries(database.prepare("SELECT status, COUNT(*) count FROM candidates GROUP BY status").all().map((row) => [row.status, row.count]));
  const rejectionReasons = Object.fromEntries(database.prepare("SELECT rejection_reason reason, COUNT(*) count FROM candidates WHERE rejection_reason IS NOT NULL GROUP BY rejection_reason ORDER BY count DESC").all().map((row) => [row.reason, row.count]));
  const provenance = database.prepare("SELECT * FROM provenance ORDER BY id").all().map((row) => ({ ...row, configuration: JSON.parse(row.configuration) }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commands: {
      resume: "npm run catalog:build",
      rebuild: "npm run catalog:rebuild",
      verify: "npm run catalog:verify"
    },
    catalog: { targetPerLevel: target, total: accepted.length, counts, techniques, requiredTechniques, hardLockedCoverage, sizes, totalBytes: Object.values(sizes).reduce((sum, item) => sum + item.bytes, 0), totalGzipBytes: Object.values(sizes).reduce((sum, item) => sum + item.gzipBytes, 0) },
    pipeline: { candidates: Object.values(statuses).reduce((sum, count) => sum + count, 0), statuses, acceptanceRate: accepted.length / Object.values(statuses).reduce((sum, count) => sum + count, 0), rejectionRate: (statuses.rejected || 0) / Object.values(statuses).reduce((sum, count) => sum + count, 0), rejectionReasons, canonicalDuplicateCount: rejectionReasons["canonical-duplicate"] || 0 },
    provenance,
    knownCoverageGaps: gaps
  };
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS build_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS provenance (id TEXT PRIMARY KEY, producer TEXT NOT NULL, version TEXT NOT NULL, source_url TEXT, configuration TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY, grid TEXT NOT NULL UNIQUE, solution TEXT, requested_level TEXT NOT NULL,
      producer TEXT NOT NULL, producer_version TEXT NOT NULL, configuration TEXT NOT NULL,
      provenance_id TEXT NOT NULL REFERENCES provenance(id), parent_id TEXT, status TEXT NOT NULL,
      rejection_reason TEXT, rated_level TEXT, clue_count INTEGER, step_count INTEGER,
      technique_metadata TEXT, required_techniques TEXT, canonical_id TEXT, canonical_grid TEXT,
      full_trace TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS candidates_status_level ON candidates(status, requested_level);
    CREATE UNIQUE INDEX IF NOT EXISTS candidates_canonical_unique ON candidates(canonical_id) WHERE canonical_id IS NOT NULL AND status='accepted';
    CREATE TABLE IF NOT EXISTS accepted (
      canonical_id TEXT PRIMARY KEY, canonical_grid TEXT NOT NULL UNIQUE,
      candidate_id INTEGER NOT NULL UNIQUE REFERENCES candidates(id), difficulty TEXT NOT NULL, accepted_at TEXT NOT NULL
    );
  `);
}

function seedProvenance(database) {
  database.prepare("INSERT OR IGNORE INTO provenance VALUES (?, ?, ?, ?, ?)").run(
    "npm:sudoku-gen@1.0.2", "sudoku-gen", "1.0.2", "https://www.npmjs.com/package/sudoku-gen", JSON.stringify({ offline: true, finalAuthority: "Sudoku Pilot solver and uniqueness checker" })
  );
  database.prepare("INSERT OR IGNORE INTO provenance VALUES (?, ?, ?, ?, ?)").run(
    "local:sudoku-pilot-augmentation@1", "Sudoku Pilot clue augmentation", "1", null,
    JSON.stringify({ derivation: "Adds only solution-consistent clues to a certified canonical seed", finalAuthority: "Sudoku Pilot solver and uniqueness checker" })
  );
  database.prepare(`INSERT INTO provenance VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET producer=excluded.producer, version=excluded.version,
    source_url=excluded.source_url, configuration=excluded.configuration`).run(
    "local:sudoku-pilot-extreme@1", "Sudoku Pilot Extreme clue augmentation", "1", null,
    JSON.stringify({ derivation: "Adds solution-consistent clues while retaining an Extreme rating", finalAuthority: "Sudoku Pilot solver and uniqueness checker" })
  );
}

function incrementState(key) {
  db.prepare("INSERT OR IGNORE INTO build_state(key,value) VALUES (?,0)").run(key);
  db.prepare("UPDATE build_state SET value=value+1 WHERE key=?").run(key);
  return db.prepare("SELECT value FROM build_state WHERE key=?").get(key).value;
}

function eligibleCount(level) {
  return db.prepare("SELECT COUNT(*) count FROM candidates WHERE requested_level=? AND status IN ('eligible','selected','accepted','coverage-not-selected')").get(level).count;
}

function combinationFor(index, values) {
  if (index === 0) return [];
  let cursor = index - 1;
  for (let size = 1; size <= 4; size += 1) {
    const combinations = choose(values, size);
    if (cursor < combinations.length) return combinations[cursor];
    cursor -= combinations.length;
  }
  throw new Error("Clue augmentation space was exhausted.");
}

function choose(values, size, start = 0, prefix = [], result = []) {
  if (prefix.length === size) { result.push(prefix); return result; }
  for (let index = start; index <= values.length - (size - prefix.length); index += 1) choose(values, size, index + 1, [...prefix, values[index]], result);
  return result;
}

function hasReasonableDistribution(grid) {
  const cells = [...grid];
  for (let line = 0; line < 9; line += 1) {
    if (!cells.slice(line * 9, line * 9 + 9).some((cell) => cell !== "0")) return false;
    if (!Array.from({ length: 9 }, (_, row) => cells[row * 9 + line]).some((cell) => cell !== "0")) return false;
    const boxRow = Math.floor(line / 3) * 3;
    const boxCol = (line % 3) * 3;
    if (!Array.from({ length: 9 }, (_, offset) => cells[(boxRow + Math.floor(offset / 3)) * 9 + boxCol + offset % 3]).some((cell) => cell !== "0")) return false;
  }
  return true;
}

function distributionRepairs(grid) {
  const cells = [...grid];
  const repairs = new Set();
  const hasClue = (indexes) => indexes.some((index) => cells[index] !== "0" || repairs.has(index));
  const addFirst = (indexes) => { if (!hasClue(indexes)) repairs.add(indexes.find((index) => cells[index] === "0")); };
  for (let row = 0; row < 9; row += 1) addFirst(Array.from({ length: 9 }, (_, col) => row * 9 + col));
  for (let col = 0; col < 9; col += 1) addFirst(Array.from({ length: 9 }, (_, row) => row * 9 + col));
  for (let box = 0; box < 9; box += 1) {
    const top = Math.floor(box / 3) * 3;
    const left = (box % 3) * 3;
    addFirst(Array.from({ length: 9 }, (_, offset) => (top + Math.floor(offset / 3)) * 9 + left + offset % 3));
  }
  return [...repairs];
}

function decodeCandidate(row) {
  return {
    id: row.id, grid: row.grid, solution: row.solution, requestedLevel: row.requested_level,
    producer: row.producer, version: row.producer_version, provenanceId: row.provenance_id,
    clueCount: row.clue_count, stepCount: row.step_count, canonicalId: row.canonical_id,
    canonicalGrid: row.canonical_grid,
    techniqueMetadata: JSON.parse(row.technique_metadata || "{}"),
    requiredTechniques: JSON.parse(row.required_techniques || "[]")
  };
}

function countTechniques(rows) {
  const counts = Object.fromEntries(ALL_TECHNIQUES.map((technique) => [technique, 0]));
  for (const row of rows) for (const technique of row.techniques) counts[technique] += 1;
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count));
}

function countRequiredTechniques(rows) {
  const counts = {};
  for (const row of rows) for (const technique of row.required) counts[technique] = (counts[technique] || 0) + 1;
  return counts;
}

function lockedCoverage(rows) {
  const counts = { pointingOnly: 0, claimingOnly: 0, mixed: 0 };
  for (const row of rows) {
    const pointing = row.techniqueMetadata["Pointing Candidates"] > 0;
    const claiming = row.techniqueMetadata["Claiming Candidates"] > 0;
    if (pointing && claiming) counts.mixed += 1;
    else if (pointing) counts.pointingOnly += 1;
    else if (claiming) counts.claimingOnly += 1;
  }
  return counts;
}

function parseOptions(args) {
  const value = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const target = Number(value("--target", 100));
  return {
    target,
    pool: Number(value("--pool", Math.max(target + 50, Math.ceil(target * 1.5)))),
    extremePool: Number(value("--extreme-pool", Math.max(target + 50, Math.ceil(target * 1.5)))),
    state: value("--state", ".catalog-build/catalog.sqlite"),
    reset: args.includes("--reset"),
    compileOnly: args.includes("--compile-only")
  };
}
