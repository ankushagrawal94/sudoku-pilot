import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  archiveCounts,
  ensureLocalArchiveIdentity,
  readLocalArchive,
  resolveWarehouseConnectionString
} from "../scripts/catalog/warehouse.mjs";

assert.equal(resolveWarehouseConnectionString({
  PUZZLE_WAREHOUSE_URL: "postgres://explicit",
  PUZZLE_WAREHOUSE_DATABASE_URL_UNPOOLED: "postgres://neon"
}), "postgres://explicit", "the provider-neutral override must take precedence");
assert.equal(resolveWarehouseConnectionString({
  PUZZLE_WAREHOUSE_DATABASE_URL_UNPOOLED: "postgres://neon"
}), "postgres://neon", "Vercel Marketplace Neon credentials must work without remapping");
assert.equal(resolveWarehouseConnectionString({}), undefined, "missing warehouse credentials must remain detectable");

const directory = await mkdtemp(path.join(tmpdir(), "sudoku-warehouse-"));
const database = new DatabaseSync(path.join(directory, "catalog.sqlite"));
try {
  database.exec(`
    CREATE TABLE provenance (id TEXT PRIMARY KEY, producer TEXT NOT NULL, version TEXT NOT NULL, source_url TEXT, configuration TEXT NOT NULL);
    CREATE TABLE candidates (
      id INTEGER PRIMARY KEY, grid TEXT NOT NULL UNIQUE, solution TEXT, requested_level TEXT NOT NULL,
      producer TEXT NOT NULL, producer_version TEXT NOT NULL, configuration TEXT NOT NULL,
      provenance_id TEXT NOT NULL, parent_id TEXT, status TEXT NOT NULL, rejection_reason TEXT,
      rated_level TEXT, clue_count INTEGER, step_count INTEGER, technique_metadata TEXT,
      required_techniques TEXT, canonical_id TEXT, canonical_grid TEXT, full_trace TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE accepted (
      canonical_id TEXT PRIMARY KEY, canonical_grid TEXT NOT NULL UNIQUE,
      candidate_id INTEGER NOT NULL UNIQUE, difficulty TEXT NOT NULL, accepted_at TEXT NOT NULL
    );
  `);
  database.prepare("INSERT INTO provenance VALUES (?,?,?,?,?)").run("test:generator@1", "Test generator", "1", null, "{}");
  const grid = `${"0".repeat(80)}1`;
  const solution = "123456789".repeat(9);
  database.prepare(`INSERT INTO candidates VALUES
    (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    grid, solution, "extreme", "test-generator", "1", "{\"seed\":7}", "test:generator@1", null,
    "accepted", null, "extreme", 1, 2, "{\"XY-Wing\":2}", "[\"XY-Wing\"]", "c1-test", grid,
    "[{\"technique\":\"XY-Wing\"}]", "2026-07-20 12:00:00"
  );
  database.prepare("INSERT INTO accepted VALUES (?,?,?,?,?)").run("c1-test", grid, 1, "extreme", "2026-07-20 12:01:00");

  const archiveId = ensureLocalArchiveIdentity(database);
  assert.equal(ensureLocalArchiveIdentity(database), archiveId, "archive identity must remain stable");

  const first = readLocalArchive(database, { solverVersion: "solver-test" });
  const repeated = readLocalArchive(database, { solverVersion: "solver-test" });
  assert.deepEqual(archiveCounts(first), { puzzles: 1, generationEvents: 1, evaluations: 1, catalogMemberships: 1 });
  assert.equal(first.events[0].event_key, repeated.events[0].event_key, "repeated syncs must be idempotent");
  assert.equal(first.evaluations[0].evaluation_key, repeated.evaluations[0].evaluation_key, "unchanged evaluations must be idempotent");
  assert.deepEqual(first.evaluations[0].technique_counts, { "XY-Wing": 2 });
  assert.deepEqual(first.evaluations[0].required_techniques, ["XY-Wing"]);
  assert.equal(first.memberships[0].snapshot_key, first.snapshot.snapshot_key);

  database.prepare("UPDATE candidates SET status='rejected', rejection_reason='new-solver-result'").run();
  const changed = readLocalArchive(database, { solverVersion: "solver-test" });
  assert.equal(changed.events[0].event_key, first.events[0].event_key, "a re-evaluation must retain its generation event");
  assert.notEqual(changed.evaluations[0].evaluation_key, first.evaluations[0].evaluation_key, "changed evaluation results must append a new evaluation");

  const newerSolver = readLocalArchive(database, { solverVersion: "solver-test-v2" });
  assert.notEqual(newerSolver.evaluations[0].evaluation_key, changed.evaluations[0].evaluation_key, "solver versions must retain independent evaluations");

  database.prepare("UPDATE archive_metadata SET value=? WHERE key='archive_id'").run("11111111-1111-4111-8111-111111111111");
  const rebuiltArchive = readLocalArchive(database, { solverVersion: "solver-test-v2" });
  assert.equal(rebuiltArchive.puzzles[0].puzzle_key, newerSolver.puzzles[0].puzzle_key, "the same exact grid must retain its puzzle identity across rebuilds");
  assert.notEqual(rebuiltArchive.events[0].event_key, newerSolver.events[0].event_key, "a later rebuild must retain a separate generation event");
} finally {
  database.close();
  await rm(directory, { recursive: true, force: true });
}

console.log("puzzle warehouse tests passed");
