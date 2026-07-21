import { createHash } from "node:crypto";

export const RICH_PRODUCER = Object.freeze({
  id: "local:sudoku-pilot-hard-gate-search@1",
  producer: "Sudoku Pilot hard-gate search",
  version: "1"
});

export function mutationFor(parent, { level, cursor, targetGates = 5, seed = "sudoku-pilot-rich-v1", retry = 0 } = {}) {
  const random = seededRandom(`${seed}:${level}:${cursor}:${retry}:${parent.id}`);
  const cells = [...parent.grid];
  const solution = parent.solution;
  const givens = indexesWhere(cells, (cell) => cell !== "0");
  const blanks = indexesWhere(cells, (cell) => cell === "0");
  const needsRepair = parent.gateCount >= targetGates && parent.gateStatus !== "solved";
  const roll = random();
  const operation = needsRepair
    ? roll < 0.72 ? "add" : "swap"
    : roll < 0.25 ? "remove" : roll < 0.9 ? "swap" : "add";
  const mutationSize = random() < 0.82 ? 1 : 2;
  const removed = [];
  const added = [];

  if ((operation === "remove" || operation === "swap") && givens.length > 19) {
    for (const index of takeRandom(givens, Math.min(mutationSize, givens.length - 19), random)) {
      cells[index] = "0";
      removed.push(index);
    }
  }
  if ((operation === "add" || operation === "swap") && blanks.length) {
    const count = operation === "swap" ? removed.length : Math.min(mutationSize, Math.max(0, 34 - givens.length));
    for (const index of takeRandom(blanks.filter((item) => !removed.includes(item)), count, random)) {
      cells[index] = solution[index];
      added.push(index);
    }
  }
  if (!removed.length && !added.length) return null;
  return {
    grid: cells.join(""),
    configuration: {
      method: "solution-consistent-clue-mutation",
      seed,
      cursor,
      retry,
      operation,
      removed,
      added,
      parentCandidateId: parent.id,
      parentGateCount: parent.gateCount,
      targetGates
    }
  };
}

export function frontierScore(candidate, targetGates = 5) {
  const exactLevel = candidate.ratedLevel === candidate.requestedLevel;
  const solved = candidate.gateStatus === "solved";
  const gates = candidate.gateCount || 0;
  const distancePenalty = Math.abs((candidate.clueCount || 27) - 26) * 3;
  return gates * 10_000
    + (solved ? 3_000 : 0)
    + (exactLevel ? 2_000 : 0)
    + (candidate.status === "eligible" ? 50_000 : 0)
    + (gates >= targetGates ? 5_000 : 0)
    + (!solved && gates >= targetGates ? (candidate.clueCount || 0) * 25 : 0)
    + (candidate.stepCount || 0)
    - distancePenalty;
}

export function seededRandom(seed) {
  let state = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function indexesWhere(values, predicate) {
  return values.flatMap((value, index) => predicate(value) ? [index] : []);
}

function takeRandom(values, count, random) {
  const pool = [...values];
  const result = [];
  while (result.length < count && pool.length) {
    result.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return result;
}
