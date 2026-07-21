import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  ensureQualityColumns,
  evaluateCatalogCandidate,
  persistCandidateEvaluation,
  recoverPendingCandidateEvaluations
} from "../scripts/catalog/quality.mjs";

const ONE_GATE = "302900080041000960000003170090030000208060400000204300000807096080000000000001000";
const FIVE_GATES = "200006003008100090070080400005000031010004200000000060806050000007000000150000900";
const EXTREME_GATE = "000060000000010863003009000904000000300000704570820000000006580690007000000040030";

const oneGate = evaluateCatalogCandidate(ONE_GATE, null, "expert");
assert.equal(oneGate.status, "rejected");
assert.equal(oneGate.reason, "insufficient-expert-gates");
assert.equal(oneGate.hardGates.gateCount, 1);

const wrongCeiling = evaluateCatalogCandidate(EXTREME_GATE, null, "expert");
assert.equal(wrongCeiling.status, "rejected");
assert.equal(wrongCeiling.reason, "difficulty-mismatch:extreme");

const database = new DatabaseSync(":memory:");
database.exec(`CREATE TABLE candidates (
  id INTEGER PRIMARY KEY, grid TEXT NOT NULL UNIQUE, solution TEXT, requested_level TEXT NOT NULL,
  status TEXT NOT NULL, rejection_reason TEXT, rated_level TEXT, clue_count INTEGER, step_count INTEGER,
  technique_metadata TEXT, required_techniques TEXT, full_trace TEXT
)`);
ensureQualityColumns(database);
database.prepare("INSERT INTO candidates(id,grid,requested_level,status) VALUES (1,?,'expert','pending')").run(FIVE_GATES);
assert.equal(recoverPendingCandidateEvaluations(database), 1);
const recovered = database.prepare("SELECT status,gate_count FROM candidates WHERE id=1").get();
assert.deepEqual({ ...recovered }, { status: "eligible", gate_count: 5 });
assert.equal(recoverPendingCandidateEvaluations(database), 0, "recovery must be idempotent");

database.prepare("INSERT INTO candidates(id,grid,requested_level,status) VALUES (2,?,'expert','pending')").run(ONE_GATE);
persistCandidateEvaluation(database, 2, oneGate);
const rejected = database.prepare("SELECT status,rejection_reason,gate_count FROM candidates WHERE id=2").get();
assert.deepEqual({ ...rejected }, { status: "rejected", rejection_reason: "insufficient-expert-gates", gate_count: 1 });
database.close();

console.log("catalog quality tests passed");
