import assert from "node:assert/strict";
import { getSudoku } from "sudoku-gen";
import { ALL_TECHNIQUES, PUZZLES, TECHNIQUE_DESCRIPTIONS, TECHNIQUE_LEVELS } from "../src/puzzles.js";
import { countSolutions, DIFFICULTY_ORDER, ratePuzzle } from "../src/difficulty.js";
import { CERTIFIED_PUZZLES, CATALOG_BY_DIFFICULTY, transformCatalogPuzzle } from "../src/puzzleCatalog.js";
import { generatePuzzle } from "../src/generator.js";
import {
  applyMove,
  candidateSets,
  createPuzzle,
  fillAllNotes,
  findAllMoves,
  isSolved,
  legalCandidates,
  parseGrid
} from "../src/solver.js";

for (const puzzleDef of PUZZLES) {
  const puzzle = createPuzzle(puzzleDef.grid);
  fillAllNotes(puzzle);
  const candidates = candidateSets(puzzle);
  assert.equal(candidates.length, 81, `${puzzleDef.id} should produce 81 candidate sets`);
  const moves = findAllMoves(puzzle, TECHNIQUE_LEVELS.extreme);
  assert.ok(moves.length > 0, `${puzzleDef.id} should have at least one logical move`);
  const move = moves[0];
  applyMove(puzzle, move);
  assert.ok(puzzle.history.length === 1, `${puzzleDef.id} should save undo history`);
}

const solved = createPuzzle("534678912672195348198342567859761423426853791713924856961537284287419635345286179");
assert.ok(isSolved(solved.values), "solved grid should validate");
assert.equal(countSolutions(PUZZLES[0].grid), 1, "known puzzle should have one solution");
assert.equal(countSolutions("0".repeat(81)), 2, "solution counting should stop at the requested limit");
assert.equal(ratePuzzle(`55${"0".repeat(79)}`).status, "invalid", "contradictory givens should be rejected");
assert.deepEqual(DIFFICULTY_ORDER, ["easy", "medium", "hard", "expert", "extreme"], "only positively certified levels should be offered");
assert.ok(ALL_TECHNIQUES.includes("Simple Colouring"), "solver capability should include newly supported techniques");
assert.deepEqual(TECHNIQUE_LEVELS.medium, TECHNIQUE_LEVELS.easy, "Easy and Medium should share singles and differ only by effort");
assert.ok(TECHNIQUE_LEVELS.hard.includes("Pointing Candidates"), "Hard should include locked candidates");
assert.ok(!TECHNIQUE_LEVELS.hard.includes("Hidden Pair"), "subsets should begin at Expert");
assert.ok(TECHNIQUE_LEVELS.expert.includes("Hidden Quadruple"), "Expert should include every supported subset");
for (const technique of ["Jellyfish", "Crane", "Simple Colouring", "Empty Rectangle"]) {
  assert.ok(TECHNIQUE_LEVELS.extreme.includes(technique), `${technique} should be part of the Extreme profile`);
  assert.ok(!TECHNIQUE_LEVELS.expert.includes(technique), `${technique} should remain above Expert`);
}

for (const difficulty of DIFFICULTY_ORDER) {
  const fixture = CERTIFIED_PUZZLES.find((puzzle) => puzzle.level === difficulty);
  const rating = ratePuzzle(fixture.grid);
  assert.equal(rating?.status, "solved", `${difficulty} generator should yield a puzzle our logical solver can finish`);
  assert.equal(rating?.level, difficulty, `${difficulty} generator should yield a puzzle certified at the requested level`);
  assert.equal(rating?.solutionCount, 1, `${difficulty} generator should yield a unique puzzle`);
  assert.ok(rating?.trace.length, `${difficulty} rating should include a solution trace`);
  assert.equal(rating?.solution.join(""), fixture.solution, `${difficulty} trace should reach the catalog solution`);
}
for (const fixture of Object.values(CATALOG_BY_DIFFICULTY).flatMap((shard) => shard.slice(0, 3))) {
  const rating = ratePuzzle(fixture.grid);
  assert.equal(rating.status, "solved", `${fixture.id} should have a complete logical trace`);
  assert.equal(rating.level, fixture.level, `${fixture.id} should retain its certified difficulty`);
  assert.equal(rating.solutionCount, 1, `${fixture.id} should have exactly one solution`);
  assert.equal(rating.solution.join(""), fixture.solution, `${fixture.id} should reach its recorded solution`);
}
for (let index = 0; index < 20; index += 1) {
  const transformed = transformCatalogPuzzle(CATALOG_BY_DIFFICULTY.extreme[index % CATALOG_BY_DIFFICULTY.extreme.length]);
  const rating = ratePuzzle(transformed.grid);
  assert.equal(rating.level, "extreme", "every Extreme transformation should preserve its certified level");
  assert.ok(TECHNIQUE_LEVELS.extreme.slice(TECHNIQUE_LEVELS.expert.length).includes(rating.hardestTechnique));
  assert.equal(rating.solution.join(""), transformed.solution, "transformed solution should stay aligned with its puzzle");
}
const requiredCatalogFixture = CERTIFIED_PUZZLES.find((puzzle) => puzzle.required.length);
assert.ok(requiredCatalogFixture, "catalog should include at least one disablement-certified required technique");
const requiredTechnique = requiredCatalogFixture.required[0];
const requiredPuzzle = generatePuzzle({ difficulty: requiredCatalogFixture.level, requiredTechniques: new Set([requiredTechnique]), random: () => 0 });
assert.equal(requiredPuzzle.rating.level, requiredCatalogFixture.level);
assert.ok(requiredPuzzle.requiredTechniques.includes(requiredTechnique), "Set-based requirements should be genuinely required, not merely present in a preferred trace");

const withoutEmptyRectangle = generatePuzzle({ difficulty: "extreme", excludedTechniques: new Set(["Empty Rectangle"]), random: () => 0 });
assert.equal(withoutEmptyRectangle.rating.techniqueCounts["Empty Rectangle"], undefined, "excluded techniques must not appear in the trace");

assert.throws(
  () => generatePuzzle({ difficulty: "easy", requiredTechniques: ["Empty Rectangle"], random: () => 0 }),
  /Empty Rectangle is not available at easy difficulty/
);
assert.throws(
  () => generatePuzzle({ difficulty: "extreme", requiredTechniques: ["XY-Wing"], excludedTechniques: new Set(["XY-Wing"]) }),
  /cannot be both required and excluded/
);
assert.throws(() => generatePuzzle({ requiredTechniques: "XY-Wing" }), /must be an array, Set, or other iterable/);
assert.ok(!TECHNIQUE_DESCRIPTIONS["2-String Kite"].includes("conjugate"), "2-String Kite description should avoid solver jargon");
assert.match(TECHNIQUE_DESCRIPTIONS["2-String Kite"], /two-place row/, "2-String Kite description should explain the pattern in beginner terms");

const hiddenQuad = findAllMoves(puzzleWithDigitCandidates({
  1: [0, 1, 2, 3], 2: [0, 1, 2, 3], 3: [0, 1, 2, 3], 4: [0, 1, 2, 3]
}), ["Hidden Quadruple"])[0];
assert.equal(hiddenQuad?.technique, "Hidden Quadruple", "four restricted digits should expose a hidden quadruple");
assert.ok(hiddenQuad.eliminations.length, "hidden quadruple should remove other candidates from its four cells");

const jellyfish = findAllMoves(puzzleWithDigitCandidates({
  1: [0, 1, 10, 11, 20, 21, 27, 30, 36]
}), ["Jellyfish"])[0];
assert.equal(jellyfish?.technique, "Jellyfish", "four linked rows and columns should expose a Jellyfish");
assert.ok(jellyfish.eliminations.some(({ index, digit }) => index === 36 && digit === 1), "Jellyfish should eliminate from a crossing column");

const crane = findAllMoves(puzzleWithDigitCandidates({ 1: [0, 10, 28, 31, 4] }), ["Crane"])[0];
assert.equal(crane?.technique, "Crane", "a box strong link connected to a line strong link should expose a Crane");
assert.ok(crane.eliminations.some(({ index, digit }) => index === 4 && digit === 1), "Crane should eliminate from a cell seeing both far ends");

const colouring = findAllMoves(puzzleWithDigitCandidates({ 1: [0, 4, 31, 30, 27, 54] }), ["Simple Colouring"])[0];
assert.equal(colouring?.technique, "Simple Colouring", "a chain of bi-locals should expose Simple Colouring");
assert.ok(colouring.eliminations.some(({ index, digit }) => index === 27 && digit === 1), "Simple Colouring should eliminate a candidate seeing both colours");

const emptyRectangle = findAllMoves(puzzleWithDigitCandidates({ 1: [0, 1, 9, 4, 40, 36] }), ["Empty Rectangle"])[0];
assert.equal(emptyRectangle?.technique, "Empty Rectangle", "crossing candidates in a block plus an outside link should expose an Empty Rectangle");
assert.ok(emptyRectangle.eliminations.some(({ index, digit }) => index === 36 && digit === 1), "Empty Rectangle should eliminate where its implications meet");

const implicitNotesPuzzle = createPuzzle(PUZZLES[0].grid);
const pointingMove = findAllMoves(implicitNotesPuzzle, ["Pointing Candidates"])
  .find((move) => move.technique === "Pointing Candidates" && move.eliminations.length);
assert.ok(pointingMove, "implicit-note board should expose an elimination move");
assert.equal(implicitNotesPuzzle.notes[pointingMove.eliminations[0].index].size, 0, "regression setup should start with no explicit notes");
applyMove(implicitNotesPuzzle, pointingMove);
for (const elimination of pointingMove.eliminations) {
  assert.equal(implicitNotesPuzzle.notes[elimination.index].size, 0, "apply should not materialize unrelated implicit candidates");
  assert.ok(implicitNotesPuzzle.eliminated[elimination.index].has(elimination.digit), "apply should record only the asserted logical elimination");
}
const repeated = findAllMoves(implicitNotesPuzzle, ["Pointing Candidates"])
  .some((move) => move.title === pointingMove.title && move.eliminations.some((elim) => pointingMove.eliminations.some((original) => original.index === elim.index && original.digit === elim.digit)));
assert.equal(repeated, false, "same implicit elimination should not repeat after applying");

const partialNotesPuzzle = createPuzzle(CERTIFIED_PUZZLES[0].grid, CERTIFIED_PUZZLES[0].solution);
const partialNoteIndex = partialNotesPuzzle.values.findIndex((value, index) => !value && legalCandidates(partialNotesPuzzle.values, index).size > 1);
const expectedLogicalCandidates = [...legalCandidates(partialNotesPuzzle.values, partialNoteIndex)].sort();
const partialNoteDigit = expectedLogicalCandidates[0];
partialNotesPuzzle.notes[partialNoteIndex] = new Set([partialNoteDigit]);
const partialNoteCandidates = candidateSets(partialNotesPuzzle)[partialNoteIndex];
assert.deepEqual([...partialNoteCandidates].sort(), expectedLogicalCandidates, "player notes must not narrow the solver's logical candidates");
const falseSingle = findAllMoves(partialNotesPuzzle, ["Naked Single"])
  .find((move) => move.fills.some(({ index, digit }) => index === partialNoteIndex && digit === partialNoteDigit));
assert.equal(falseSingle, undefined, "a partial player note must not create a false Naked Single");

const kitePuzzle = puzzleWithDigitCandidates({ 1: [0, 4, 10, 37, 40] });
const kite = findAllMoves(kitePuzzle, ["2-String Kite"])
  .find((move) => move.eliminations.some(({ index, digit }) => index === 40 && digit === 1));
assert.ok(kite, "a row and column strong link connected through a block should expose a 2-String Kite");

const hiddenPairPuzzle = createPuzzle(PUZZLES.find((puzzle) => puzzle.id === "candidate-lines").grid);
fillAllNotes(hiddenPairPuzzle);
const hiddenPair = findAllMoves(hiddenPairPuzzle, ["Hidden Pair"]).find((move) => move.technique === "Hidden Pair");
assert.ok(hiddenPair, "candidate-lines should expose a hidden pair");
assert.match(hiddenPair.title, /^\d and \d hidden in /, "hidden pair title should read as two digits, not one concatenated number");
assert.match(hiddenPair.explanation, /^\d and \d can appear only /, "hidden pair explanation should use readable digit list");

const hiddenSubsetMoves = PUZZLES.flatMap((puzzleDef) => {
  const puzzle = createPuzzle(puzzleDef.grid);
  fillAllNotes(puzzle);
  return findAllMoves(puzzle, ["Hidden Pair", "Hidden Triple"]).map((move) => ({ puzzle, move }));
});
for (const { puzzle, move } of hiddenSubsetMoves) {
  const unitMatch = move.title.match(/hidden in (row|column|block) (\d+)/);
  assert.ok(unitMatch, `hidden subset should name its unit: ${move.title}`);
  const [, type, number] = unitMatch;
  const unit = unitCells(type, Number(number) - 1);
  const solvedDigits = new Set(unit.map((index) => puzzle.values[index]).filter(Boolean));
  for (const digit of new Set(move.evidence.map((item) => item.digit))) {
    assert.equal(solvedDigits.has(digit), false, `${move.title} should not use solved digit ${digit}`);
  }
}

// sudoku-gen represents blanks with hyphens. Parsing them as omitted characters shifts every
// later clue and can make an otherwise sound move detector appear to produce false moves.
const kiteRegression = "6-5-4--------1--6-7-----9-3-9-8------8---1--2236---------27---------6-9--------38";
const wWingRegression = "4-192---6--8-4----63-5-17-9-4--7-2937-31-----2-----8--3--2--4-5--475-9625-74--13-";
for (const grid of [kiteRegression, wWingRegression]) {
  assert.equal(parseGrid(grid).length, 81, "a sudoku-gen grid must retain all 81 cell positions");
  assert.deepEqual(parseGrid(grid), [...grid].map((cell) => /[1-9]/.test(cell) ? Number(cell) : 0), "hyphens must represent blank cells in place");
}

// The supplied cases must not remove a known solution candidate. This is a direct regression
// for the reported 2-String Kite and W-Wing false eliminations.
assertMoveSequencesPreserveSolution(kiteRegression, "615349827923718564748625913591832476487961352236457189859273641374186295162594738", ["2-String Kite"]);
assertMoveSequencesPreserveSolution(wWingRegression, "451927386978346521632581749146875293783192654295634817369218475814753962527469138", ["W-Wing"]);

// Generated puzzles carry their supplied sudoku-gen solution. Verify every available logical
// move and a sequence of applied moves against that oracle.
for (const difficulty of ["easy", "medium", "hard"]) {
  const generated = getSudoku(difficulty);
  assertMoveSequencesPreserveSolution(generated.puzzle, generated.solution, ALL_TECHNIQUES);
}

console.log("solver tests passed");

function assertMoveSequencesPreserveSolution(grid, solution, allowed) {
  const puzzle = createPuzzle(grid, solution);
  fillAllNotes(puzzle);
  for (let step = 0; step < 30; step += 1) {
    const moves = findAllMoves(puzzle, allowed);
    for (const move of moves) assertMovePreservesSolution(puzzle, move);
    if (!moves.length) return;
    applyMove(puzzle, moves[0]);
  }
}

function assertMovePreservesSolution(puzzle, move) {
  for (const fill of move.fills) {
    assert.equal(fill.digit, puzzle.solution[fill.index], `${move.technique} must fill the supplied solution digit at r${Math.floor(fill.index / 9) + 1}c${fill.index % 9 + 1}`);
  }
  for (const elimination of move.eliminations) {
    assert.notEqual(elimination.digit, puzzle.solution[elimination.index], `${move.technique} must not eliminate the supplied solution digit at r${Math.floor(elimination.index / 9) + 1}c${elimination.index % 9 + 1}`);
  }
}

function unitCells(type, index) {
  if (type === "row") return Array.from({ length: 9 }, (_, col) => index * 9 + col);
  if (type === "column") return Array.from({ length: 9 }, (_, row) => row * 9 + index);
  const top = Math.floor(index / 3) * 3;
  const left = (index % 3) * 3;
  const cells = [];
  for (let row = top; row < top + 3; row += 1) {
    for (let col = left; col < left + 3; col += 1) cells.push(row * 9 + col);
  }
  return cells;
}

function puzzleWithDigitCandidates(candidateIndexesByDigit) {
  const puzzle = createPuzzle("0".repeat(81));
  for (const [digitText, indexes] of Object.entries(candidateIndexesByDigit)) {
    const digit = Number(digitText);
    for (const eliminated of puzzle.eliminated) eliminated.add(digit);
    for (const index of indexes) puzzle.eliminated[index].delete(digit);
  }
  fillAllNotes(puzzle);
  return puzzle;
}
