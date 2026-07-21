import assert from "node:assert/strict";
import { analyzeMinimumHardGates, evaluateHardGates } from "../src/difficulty.js";

const ONE_EXPERT_GATE = "302900080041000960000003170090030000208060400000204300000807096080000000000001000";
const SEPARATED_EXPERT_GATES = "901003270070000900080904000000030508000007000034200000002000490105000003000010000";
const CONSECUTIVE_EXPERT_GATES = "200006003008100090070080400005000031010004200000000060806050000007000000150000900";
const EXTREME_GATE = "000060000000010863003009000904000000300000704570820000000006580690007000000040030";

const one = evaluateHardGates(ONE_EXPERT_GATE, { level: "expert" });
assert.equal(one.status, "solved");
assert.equal(one.gateCount, 1, "one tier-level move must count as one Expert gate");
assert.deepEqual(one.gateTechniques, ["Hidden Pair"]);

const separated = evaluateHardGates(SEPARATED_EXPERT_GATES, { level: "expert" });
assert.equal(separated.gateCount, 2);
assert.ok(separated.gates[1].lowerStepsBeforeGate > 0, "lower-tier progress must be exhausted between separated gates");
assert.ok(separated.gateTracePositions[1] > separated.gateTracePositions[0] + 1);

const consecutive = evaluateHardGates(CONSECUTIVE_EXPERT_GATES, { level: "expert" });
assert.equal(consecutive.gateCount, 5);
assert.ok(consecutive.gates.some((gate, index) => index > 0 && gate.tracePosition === consecutive.gates[index - 1].tracePosition + 1),
  "a second immediately required tier move must count as another gate");

const expertCeiling = evaluateHardGates(EXTREME_GATE, { level: "expert" });
assert.equal(expertCeiling.status, "ceiling-exceeded", "a puzzle requiring an Extreme move must not certify as Expert");
const extremeCeiling = evaluateHardGates(EXTREME_GATE, { level: "extreme" });
assert.equal(extremeCeiling.status, "solved");
assert.equal(extremeCeiling.gateCount, 1);

assert.deepEqual(
  evaluateHardGates(CONSECUTIVE_EXPERT_GATES, { level: "expert" }),
  consecutive,
  "hard-gate evaluation must be deterministic"
);

const exactMinimum = analyzeMinimumHardGates(CONSECUTIVE_EXPERT_GATES, { level: "expert", nodeLimit: 1_000 });
assert.equal(exactMinimum.status, "proven");
assert.equal(exactMinimum.exactMinimum, 5, "the bounded all-path search must only label a minimum after proving it");
const boundedOut = analyzeMinimumHardGates(ONE_EXPERT_GATE, { level: "expert", nodeLimit: 1 });
assert.equal(boundedOut.status, "inconclusive");
assert.equal(boundedOut.exactMinimum, null);
assert.equal(boundedOut.deterministicGateCount, 1, "an incomplete proof may retain the deterministic path only as an upper bound");

for (const transformed of [
  relabel(CONSECUTIVE_EXPERT_GATES),
  transpose(CONSECUTIVE_EXPERT_GATES),
  swapFirstRows(CONSECUTIVE_EXPERT_GATES)
]) {
  const result = evaluateHardGates(transformed, { level: "expert" });
  assert.equal(result.gateCount, consecutive.gateCount, "supported Sudoku transformations must preserve gate count");
  assert.deepEqual(result.gateTechniques, consecutive.gateTechniques, "supported Sudoku transformations must preserve the gate technique path");
}

assert.throws(() => evaluateHardGates(ONE_EXPERT_GATE, { level: "hard" }), /only defined/);

console.log("hard-gate tests passed");

function relabel(grid) {
  return [...grid].map((cell) => cell === "0" ? cell : String(10 - Number(cell))).join("");
}

function transpose(grid) {
  return Array.from({ length: 81 }, (_, index) => grid[(index % 9) * 9 + Math.floor(index / 9)]).join("");
}

function swapFirstRows(grid) {
  const rows = [1, 0, 2, 3, 4, 5, 6, 7, 8];
  return rows.flatMap((row) => [...grid.slice(row * 9, row * 9 + 9)]).join("");
}
