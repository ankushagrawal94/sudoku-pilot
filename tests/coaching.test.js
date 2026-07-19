import assert from "node:assert/strict";
import { buildCoachingMove, COACHING_DEFINITIONS, validateCoachingCatalog } from "../src/coaching.js";
import { COMMITTED_COACHING_TECHNIQUES, PROVISIONAL_TECHNIQUES } from "../src/puzzles.js";
import { applyMove, candidateSets, clonePuzzle, findAllMoves } from "../src/solver.js";
import { buildTechniqueFixtureSuite } from "./fixtures/coaching-fixtures.js";

assert.ok(validateCoachingCatalog());
assert.deepEqual(Object.keys(COACHING_DEFINITIONS), COMMITTED_COACHING_TECHNIQUES, "coaching catalog must exactly match committed Tier 1 and Tier 2");
for (const technique of PROVISIONAL_TECHNIQUES) assert.equal(COACHING_DEFINITIONS[technique], undefined, `${technique} must remain provisional`);

for (const technique of COMMITTED_COACHING_TECHNIQUES) {
  const suite = buildTechniqueFixtureSuite(technique);
  assert.equal(suite.positive.length, 10, `${technique} needs 10 deterministic positive fixtures`);
  assert.equal(suite.nearMiss.length, 5, `${technique} needs 5 adversarial near misses`);
  assert.equal(suite.multipleMove.length, 3, `${technique} needs 3 multiple-move fixtures`);
  assert.equal(suite.partialNote.length, 3, `${technique} needs 3 partial-note fixtures`);

  for (const fixture of suite.positive) {
    const moves = findAllMoves(fixture.puzzle, [technique]);
    const move = moves.find((candidate) => actionKey(candidate) === fixture.expectedAction);
    assert.ok(move, `${fixture.id} must expose its certified ${technique} action`);
    assertSolutionSafe(fixture.puzzle, move);
    assertEvidenceIsLogical(fixture.puzzle, move);

    const coaching = buildCoachingMove(move, fixture.puzzle);
    assert.equal(coaching.technique, technique);
    assert.ok(coaching.definition.canonicalName);
    assert.ok(coaching.definition.shortDefinition);
    assert.ok(coaching.patternType);
    assert.ok(coaching.relevantDigits.length);
    assert.ok(coaching.relevantUnits.length, `${technique} must encode relevant units`);
    assert.ok(coaching.evidenceCells.length);
    assert.ok(coaching.exactExplanation);
    assert.equal(coaching.stages.length, 4);
    assert.deepEqual(coaching.stages.map(({ number }) => number), [1, 2, 3, 4]);
    assert.equal(coaching.stages[0].revealedDigits.length, 0);
    assert.equal(coaching.stages[0].revealedUnits.length, 0);
    assert.doesNotMatch(coaching.stages[0].message.replaceAll(technique, ""), /r\d+c\d+|\b(row|column|block) \d+\b|\b[1-9]\b/i, `${technique} Stage 1 must not leak focus facts`);
    assert.ok(coaching.stages[1].revealedDigits.length <= 1, `${technique} Stage 2 reveals at most one focus digit`);
    assert.equal(coaching.stages[1].revealedUnits.length, 0);
    assert.ok(coaching.stages[2].revealedUnits.length);
    assert.doesNotMatch(coaching.stages[2].message, /\b(remove|eliminate|fill|place)\b|r\d+c\d+/i, `${technique} Stage 3 must not reveal the action`);
    assert.equal(coaching.stages[3].message, coaching.exactExplanation);
    assert.ok(coaching.visualization.searchCells.length);
    assert.ok(coaching.visualization.roles.includes("evidence"));
    assert.ok(coaching.visualization.roles.includes("elimination"));
    if (["X-Wing", "Swordfish", "Skyscraper", "2-String Kite", "XY-Wing", "XYZ-Wing", "W-Wing"].includes(technique)) {
      assert.ok(coaching.relationships.length, `${technique} must encode its pattern relationships`);
    }

    assertExactPatchAndUndo(fixture.puzzle, move);
  }

  for (const fixture of suite.nearMiss) {
    const repeated = findAllMoves(fixture.puzzle, [technique]).some((move) => actionKey(move) === fixture.expectedAction);
    assert.equal(repeated, false, `${fixture.id} must reject the invalid or already-resolved pattern`);
  }

  for (const fixture of suite.multipleMove) {
    assert.ok(findAllMoves(fixture.puzzle, COMMITTED_COACHING_TECHNIQUES).length > 1, `${fixture.id} must present multiple available moves`);
  }

  for (const fixture of suite.partialNote) {
    const move = findAllMoves(fixture.puzzle, [technique]).find((candidate) => actionKey(candidate) === fixture.expectedAction);
    assert.ok(move, `${fixture.id} partial player notes must not alter logical detection`);
    assertSolutionSafe(fixture.puzzle, move);
  }
}

console.log("coaching fixture and contract tests passed");

function assertSolutionSafe(puzzle, move) {
  for (const fill of move.fills) assert.equal(fill.digit, puzzle.solution[fill.index], `${move.technique} must place the known solution digit`);
  for (const elimination of move.eliminations) assert.notEqual(elimination.digit, puzzle.solution[elimination.index], `${move.technique} must preserve the known solution candidate`);
}

function assertEvidenceIsLogical(puzzle, move) {
  const candidates = candidateSets(puzzle);
  for (const evidence of move.evidence) {
    if (!evidence.digit || puzzle.values[evidence.index]) continue;
    if (["scan", "unit"].includes(evidence.role)) continue;
    assert.ok(candidates[evidence.index].has(evidence.digit), `${move.technique} evidence ${evidence.digit} at ${evidence.index} must exist`);
  }
}

function assertExactPatchAndUndo(source, move) {
  const puzzle = clonePuzzle(source);
  const before = stateSnapshot(puzzle);
  applyMove(puzzle, move);
  const after = stateSnapshot(puzzle);
  const actionCells = new Set([...move.fills, ...move.eliminations].map(({ index }) => index));
  for (let index = 0; index < 81; index += 1) {
    if (actionCells.has(index)) continue;
    assert.equal(after.values[index], before.values[index], `${move.technique} changed an unasserted value at ${index}`);
    assert.deepEqual(after.notes[index], before.notes[index], `${move.technique} changed unasserted player notes at ${index}`);
    assert.deepEqual(after.eliminated[index], before.eliminated[index], `${move.technique} changed an unasserted logical candidate at ${index}`);
  }
  for (const elimination of move.eliminations) {
    assert.ok(after.eliminated[elimination.index].includes(elimination.digit), `${move.technique} did not apply its asserted elimination`);
  }
  for (const fill of move.fills) assert.equal(after.values[fill.index], fill.digit, `${move.technique} did not apply its asserted placement`);
  const undoSnapshot = puzzle.history.at(-1);
  assert.deepEqual(stateSnapshot(undoSnapshot), before, `${move.technique} must be exactly undoable`);
}

function stateSnapshot(puzzle) {
  return {
    values: [...puzzle.values],
    notes: puzzle.notes.map((notes) => [...notes].sort()),
    eliminated: puzzle.eliminated.map((digits) => [...digits].sort())
  };
}

function actionKey(move) {
  return [
    move.technique,
    ...move.fills.map(({ index, digit }) => `f${index}-${digit}`).sort(),
    ...move.eliminations.map(({ index, digit }) => `e${index}-${digit}`).sort()
  ].join("|");
}
