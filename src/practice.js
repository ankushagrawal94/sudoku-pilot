import { buildCoachingMove } from "./coaching.js";
import { getTechniqueLesson } from "./learning.js";
import { COMMITTED_COACHING_TECHNIQUES } from "./puzzles.js";
import {
  applyMove,
  candidateSets,
  clonePuzzle,
  colOf,
  createPuzzle,
  fillAllNotes,
  findAllMoves,
  isSolved,
  PEERS,
  rowOf,
  UNITS
} from "./solver.js";

export const PRACTICE_MODES = Object.freeze([
  { id: "find-pattern", label: "Find the pattern", description: "Open a board where the chosen technique is ready to find." },
  { id: "complete-puzzle", label: "Complete the puzzle", description: "Solve a full puzzle whose first useful move uses the chosen technique." },
  { id: "near-miss", label: "Near-miss recognition", description: "Compare a real pattern with a look-alike that breaks one rule." }
]);

const FIXTURE_SEEDS = {
  "last-digit": {
    grid: "000040003000030791903000200709803010840012000600000000082005300064390000090100500",
    solution: "216749853458236791973581264729863415845912637631457928182675349564398172397124586"
  },
  "hard-focus": {
    grid: "000040003000030791903080200709803010800012000600000000082005300064390000090100500",
    solution: "216749853458236791973581264729863415845912637631457928182675349564398172397124586"
  },
  "hidden-single": {
    grid: "000000800680000100000618453004030021000902504032045000008009000006870240010304008",
    solution: "143257869685493172279618453854736921761982534932145786428569317396871245517324698"
  },
  "naked-pair": {
    grid: "000900000420600000080000170300000040000000030007004006010280700000000091600400300",
    solution: "731958462429617583586342179398165247164729835257834916913286754842573691675491328"
  },
  subsets: {
    grid: "302900080040000900000403170094030000208060400060204300003807096000000040000001000",
    solution: "372916584841572963956483172594138627238765419167294358413857296685329741729641835"
  },
  "x-wing": {
    grid: "001009030760003002002640019403900170000004003095000020014560300070092041000000060",
    solution: "841729635769153482532648719423985176687214953195376824214567398376892541958431267"
  },
  swordfish: {
    grid: "090000042001902000000006790910000607070060050005009024148003205009124006000807009",
    solution: "697315842481972563523486791912548637374261958865739124148693275759124386236857419"
  },
  "kite-and-xy": {
    grid: "090000000001900060520086790902000630370200050005039020040003205700004080206800010",
    solution: "697315842481972563523486791912548637374261958865739124148693275759124386236857419"
  },
  "xyz-wing": {
    grid: "000009600769000002002640009403900170680000903005000800010560090000892041000401000",
    solution: "841729635769153482532648719423985176687214953195376824214567398376892541958431267"
  },
  "w-wing": {
    grid: "000000030769103002002600009400900070000004903095070804210560000300090041000400200",
    solution: "841729635769153482532648719423985176687214953195376824214567398376892541958431267"
  },
  "coaching-easy": {
    grid: "050002004730009085402000960290000800001026500800904021020001437083007000040260198",
    solution: "958632714736149285412758963294315876371826549865974321629581437183497652547263198"
  },
  "coaching-medium": {
    grid: "070010000300600000000048702000080405401007809700400000100062098003790060020001300",
    solution: "874213956392675184615948732239186475461537829758429613147362598583794261926851347"
  }
};

const FOCUSED_REPLAYS = {
  "Last Digit": ["last-digit", 19],
  "Naked Single": ["hard-focus", 22],
  "Hidden Single": ["hidden-single", 19],
  "Pointing Candidates": ["hard-focus", 19],
  "Claiming Candidates": ["hard-focus", 21],
  "Naked Pair": ["naked-pair", 5],
  "Hidden Pair": ["subsets", 7],
  "Naked Triple": ["subsets", 7],
  "Hidden Triple": ["subsets", 5],
  "Naked Quadruple": ["subsets", 5],
  "X-Wing": ["x-wing", 18],
  Swordfish: ["swordfish", 24],
  Skyscraper: ["kite-and-xy", 12],
  "2-String Kite": ["kite-and-xy", 18],
  "XY-Wing": ["kite-and-xy", 20],
  "XYZ-Wing": ["xyz-wing", 10],
  "W-Wing": ["w-wing", 14]
};

const BROAD_REPLAYS = {
  "Naked Single": ["coaching-easy", 0],
  "Hidden Single": ["coaching-easy", 0],
  "Pointing Candidates": ["coaching-easy", 0],
  "Claiming Candidates": ["coaching-easy", 0],
  "Naked Pair": ["coaching-easy", 0],
  "Hidden Pair": ["coaching-easy", 0],
  "Hidden Triple": ["coaching-easy", 0],
  "Naked Quadruple": ["coaching-easy", 0],
  "X-Wing": ["coaching-easy", 0],
  Swordfish: ["coaching-easy", 0],
  "XYZ-Wing": ["coaching-easy", 0],
  "Naked Triple": ["coaching-easy", 1],
  "XY-Wing": ["coaching-easy", 1],
  "Last Digit": ["coaching-easy", 4],
  "W-Wing": ["coaching-easy", 6],
  Skyscraper: ["coaching-easy", 7],
  "2-String Kite": ["coaching-medium", 14]
};

const SINGLE_TECHNIQUES = ["Last Digit", "Naked Single", "Hidden Single"];
const LOCKED_CANDIDATE_TECHNIQUES = ["Pointing Candidates", "Claiming Candidates"];
const SUBSET_TECHNIQUES = ["Naked Pair", "Hidden Pair", "Naked Triple", "Hidden Triple", "Naked Quadruple"];

const INDEX_TRANSFORMS = [
  (row, col) => [row, col],
  (row, col) => [col, row],
  (row, col) => [col, 8 - row],
  (row, col) => [8 - row, 8 - col],
  (row, col) => [8 - col, row],
  (row, col) => [row, 8 - col],
  (row, col) => [8 - row, col],
  (row, col) => [row % 3 === 0 ? row + 1 : row % 3 === 1 ? row - 1 : row, col],
  (row, col) => [row < 3 ? row + 3 : row < 6 ? row - 3 : row, col],
  (row, col) => [row, col % 3 === 0 ? col + 1 : col % 3 === 1 ? col - 1 : col]
];

const practiceCache = new Map();

export function buildCanonicalCoachingFixtures() {
  return Object.fromEntries(COMMITTED_COACHING_TECHNIQUES.map((technique) => [technique, buildCanonicalFixture(technique)]));
}

export function buildTechniqueFixtureSuite(technique) {
  assertCommittedTechnique(technique);
  const base = buildCanonicalFixture(technique);
  const positive = INDEX_TRANSFORMS.map((transform, index) => transformFixture(base, transform, index));
  const nearMissBase = createMutationNearMiss(base);
  const nearMiss = INDEX_TRANSFORMS.slice(0, 5).map((transform, index) => transformFixture(nearMissBase, transform, index + 3, false));
  const broadBase = buildBroadFixture(technique);
  const multipleMove = INDEX_TRANSFORMS.slice(0, 3).map((transform, index) => ({
    ...transformFixture(broadBase, transform, index),
    category: "multiple-move"
  }));
  const partialNote = positive.slice(3, 6).map((fixture, index) => {
    const puzzle = clonePuzzle(fixture.puzzle);
    const open = puzzle.values.map((value, cell) => value ? -1 : cell).filter((cell) => cell >= 0).slice(index, index + 3);
    for (const cell of open) {
      const logical = [...candidateSets(puzzle)[cell]];
      puzzle.notes[cell] = new Set(logical.slice(0, Math.max(1, Math.floor(logical.length / 2))));
    }
    return { ...fixture, id: `${fixture.id}-partial`, puzzle, category: "partial-note" };
  });
  return { positive, nearMiss, multipleMove, partialNote };
}

export function getCertifiedPracticeFixtures(technique) {
  assertCommittedTechnique(technique);
  if (!practiceCache.has(technique)) practiceCache.set(technique, buildCertifiedPracticeFixtures(technique));
  return practiceCache.get(technique);
}

export function createPracticeState(technique, mode, index = 0) {
  assertCommittedTechnique(technique);
  if (!PRACTICE_MODES.some((item) => item.id === mode)) throw new Error(`Unknown practice mode: ${mode}`);
  const fixtures = getCertifiedPracticeFixtures(technique);
  const fixture = fixtures[mod(index, fixtures.length)];
  return {
    id: `${fixture.id}-${mode}`,
    technique,
    mode,
    fixtureIndex: mod(index, fixtures.length),
    puzzle: clonePuzzle(fixture.puzzle),
    targetMove: cloneMove(fixture.targetMove),
    coaching: fixture.coaching,
    completionTrace: fixture.completionTrace.map(cloneMove),
    nearMiss: {
      ...fixture.nearMiss,
      evidenceCandidates: fixture.nearMiss.evidenceCandidates.map((item) => ({ ...item })),
      evidenceCells: [...fixture.nearMiss.evidenceCells]
    },
    certification: { ...fixture.certification }
  };
}

export function validatePracticeFixture(fixture) {
  if (!fixture?.puzzle?.solution || fixture.puzzle.values.length !== 81) throw new Error("Practice fixture needs a known 81-cell solution.");
  const targetMoves = findAllMoves(fixture.puzzle, [fixture.technique]);
  const target = targetMoves.find((move) => actionKey(move) === actionKey(fixture.targetMove));
  if (!target) throw new Error(`${fixture.id} does not expose its certified ${fixture.technique} action.`);
  if (targetMoves.length !== 1) throw new Error(`${fixture.id} must expose exactly one ${fixture.technique} action, not ${targetMoves.length}.`);
  if (SINGLE_TECHNIQUES.includes(fixture.technique)) {
    const competingSingles = findAllMoves(fixture.puzzle, SINGLE_TECHNIQUES)
      .filter((move) => effectKey(move) !== effectKey(target));
    if (competingSingles.length) {
      throw new Error(`${fixture.id} exposes a competing single placement: ${competingSingles[0].technique}.`);
    }
  }
  const prerequisites = practicePrerequisites(fixture.technique);
  const distractions = findAllMoves(fixture.puzzle, prerequisites);
  if (distractions.length) {
    throw new Error(`${fixture.id} exposes an earlier practice move: ${distractions[0].technique}.`);
  }
  assertSolutionSafe(fixture.puzzle, target);
  if (!fixture.completionTrace.length || fixture.completionTrace[0].technique !== fixture.technique) {
    throw new Error(`${fixture.id} completion path must begin with ${fixture.technique}.`);
  }
  if (fixture.completionTrace.some((move) => !COMMITTED_COACHING_TECHNIQUES.includes(move.technique))) {
    throw new Error(`${fixture.id} uses an unsupported completion technique.`);
  }
  if (!fixture.certification.unique || !fixture.certification.targetAvailable || !fixture.certification.solutionPreserved || !fixture.certification.focusedStart) {
    throw new Error(`${fixture.id} is missing required certification flags.`);
  }
  return true;
}

function buildCertifiedPracticeFixtures(technique) {
  const lesson = getTechniqueLesson(technique);
  const positive = buildPositiveFixtures(technique);
  return positive.map((fixture, index) => {
    const targetMove = findAllMoves(fixture.puzzle, [technique]).find((move) => actionKey(move) === fixture.expectedAction);
    if (!targetMove) throw new Error(`${fixture.id} lost its target action.`);
    const coaching = buildCoachingMove(targetMove, fixture.puzzle);
    const completionTrace = buildCompletionTrace(fixture.puzzle, targetMove);
    const nearMiss = buildRecognitionClaim(fixture.puzzle, targetMove, coaching, index % 2 === 0, lesson);
    const result = {
      id: `${fixture.id}-practice`,
      technique,
      puzzle: clonePuzzle(fixture.puzzle),
      targetMove: cloneMove(targetMove),
      coaching,
      completionTrace,
      nearMiss,
      certification: {
        unique: true,
        targetAvailable: true,
        candidateCorrect: true,
        solutionPreserved: true,
        focusedStart: true,
        unsupportedTechniques: false,
        source: "deterministic-focused-checkpoint-and-sudoku-isomorphism"
      }
    };
    validatePracticeFixture(result);
    return Object.freeze(result);
  });
}

function buildCompletionTrace(source, targetMove) {
  const puzzle = clonePuzzle(source);
  const trace = [cloneMove(targetMove)];
  applyMove(puzzle, targetMove);
  for (let step = 0; step < 200 && !isSolved(puzzle.values); step += 1) {
    const move = findAllMoves(puzzle, COMMITTED_COACHING_TECHNIQUES)[0];
    if (!move) throw new Error(`${targetMove.technique} practice state cannot complete with the committed catalog.`);
    assertSolutionSafe(puzzle, move);
    trace.push(cloneMove(move));
    applyMove(puzzle, move);
  }
  if (!isSolved(puzzle.values)) throw new Error(`${targetMove.technique} practice completion exceeded the step limit.`);
  return trace;
}

function buildRecognitionClaim(puzzle, targetMove, coaching, valid, lesson) {
  const evidenceCandidates = coaching.evidenceCandidates.map((item) => ({ ...item }));
  const evidenceCells = [...coaching.evidenceCells];
  if (valid) {
    return {
      valid: true,
      prompt: `Do the highlighted cells show a real ${targetMove.technique}?`,
      explanation: `Yes. ${lesson.howToRecognize.conditions.join(" ")}`,
      evidenceCandidates,
      evidenceCells
    };
  }
  const candidates = candidateSets(puzzle);
  const first = evidenceCandidates[0];
  const actionCells = new Set([...targetMove.fills, ...targetMove.eliminations].map(({ index }) => index));
  const replacement = first && puzzle.values.findIndex((value, index) => (
    !value && !evidenceCells.includes(index) && !actionCells.has(index) && candidates[index].has(first.digit)
  ));
  if (first && replacement >= 0) {
    evidenceCandidates[0] = { ...first, index: replacement, role: "near-miss" };
    evidenceCells[0] = replacement;
  } else {
    evidenceCandidates.pop();
    evidenceCells.pop();
  }
  const changedEvidence = first && replacement >= 0
    ? `The outlined candidate at row ${rowOf(replacement) + 1}, column ${colOf(replacement) + 1} replaces one required candidate.`
    : "One required candidate is missing from the outlined group.";
  return {
    valid: false,
    prompt: `Do the highlighted cells show a real ${targetMove.technique}?`,
    explanation: `No. ${changedEvidence} ${brokenRecognitionRule(targetMove.technique)}`,
    evidenceCandidates,
    evidenceCells
  };
}

function brokenRecognitionRule(technique) {
  return ({
    "Last Digit": "The outlined cells no longer show one row, column, or block with exactly one empty cell.",
    "Naked Single": "The outline no longer identifies one cell with exactly one legal candidate.",
    "Hidden Single": "The outline no longer shows every possible cell for one digit inside a single row, column, or block.",
    "Pointing Candidates": "The outlined candidates no longer stay inside one block and on one shared row or column.",
    "Claiming Candidates": "The outlined candidates no longer stay on one row or column and inside one shared block.",
    "Naked Pair": "The outline no longer shows two cells in one row, column, or block using only two digits between them.",
    "Hidden Pair": "The outline no longer shows two digits restricted to the same two cells in one row, column, or block.",
    "Naked Triple": "The outline no longer shows three cells in one row, column, or block using only three digits between them.",
    "Hidden Triple": "The outline no longer shows three digits restricted to the same three cells in one row, column, or block.",
    "Naked Quadruple": "The outline no longer shows four cells in one row, column, or block using only four digits between them.",
    "X-Wing": "The two chosen rows no longer place the digit in the same two columns.",
    Swordfish: "The three chosen rows no longer keep every possible cell within the same three columns.",
    Skyscraper: "The two two-place rows or columns no longer have exactly one pair lined up.",
    "2-String Kite": "The row pair and column pair no longer connect through one shared block.",
    "XY-Wing": "The center and two outer cells no longer have the required shared candidate pairs.",
    "XYZ-Wing": "The center and two outer cells no longer use the required three candidates in the required positions.",
    "W-Wing": "The matching two-candidate cells are no longer connected by a valid two-place link."
  })[technique] || "The outlined cells no longer satisfy the pattern's required counts and positions.";
}

function buildCanonicalFixture(technique) {
  const [seedId, stepCount] = FOCUSED_REPLAYS[technique] || [];
  return replayFixture(technique, seedId, stepCount);
}

function buildPositiveFixtures(technique) {
  const base = buildCanonicalFixture(technique);
  return INDEX_TRANSFORMS.map((transform, index) => transformFixture(base, transform, index));
}

function buildBroadFixture(technique) {
  const [seedId, stepCount] = BROAD_REPLAYS[technique] || [];
  const replayTechniques = COMMITTED_COACHING_TECHNIQUES.filter((name) => name !== "2-String Kite");
  return replayFixture(technique, seedId, stepCount, replayTechniques);
}

function replayFixture(technique, seedId, stepCount, replayTechniques = COMMITTED_COACHING_TECHNIQUES) {
  if (!Number.isInteger(stepCount)) throw new Error(`Missing replay step for ${technique}.`);
  const seed = FIXTURE_SEEDS[seedId];
  if (!seed) throw new Error(`Unknown coaching fixture seed: ${seedId}.`);
  const puzzle = createPuzzle(seed.grid, seed.solution);
  fillAllNotes(puzzle);
  for (let step = 0; step < stepCount; step += 1) {
    const move = findAllMoves(puzzle, replayTechniques)[0];
    if (!move) throw new Error(`${seedId} ended before step ${stepCount}.`);
    applyMove(puzzle, move);
  }
  fillAllNotes(puzzle);
  puzzle.givens = puzzle.values.map(Boolean);
  puzzle.history = [];
  const move = findAllMoves(puzzle, [technique])[0];
  if (!move) throw new Error(`${seedId} step ${stepCount} does not expose ${technique}.`);
  assertSolutionSafe(puzzle, move);
  return {
    id: `${slug(technique)}-base`,
    technique,
    puzzle,
    expectedAction: actionKey(move),
    move,
    category: "positive"
  };
}

function transformFixture(fixture, transform, digitOffset, requireMove = true) {
  const puzzle = transformPuzzle(fixture.puzzle, transform, digitOffset);
  const moves = findAllMoves(puzzle, [fixture.technique]);
  const move = requireMove ? moves[0] : moves.find((candidate) => actionKey(candidate) === transformActionKey(fixture.expectedAction, transform, digitOffset));
  if (requireMove && !move) throw new Error(`Transformed fixture lost ${fixture.technique}.`);
  if (move) assertSolutionSafe(puzzle, move);
  return {
    id: `${fixture.id}-v${digitOffset}-${INDEX_TRANSFORMS.indexOf(transform)}`,
    technique: fixture.technique,
    puzzle,
    expectedAction: requireMove ? actionKey(move) : transformActionKey(fixture.expectedAction, transform, digitOffset),
    move,
    category: fixture.category
  };
}

function transformPuzzle(source, transform, digitOffset) {
  const puzzle = createPuzzle("0".repeat(81));
  puzzle.values = transformArray(source.values, transform, (digit) => mapDigit(digit, digitOffset));
  puzzle.givens = transformArray(source.givens, transform, Boolean);
  puzzle.notes = transformArray(source.notes, transform, (digits) => new Set([...digits].map((digit) => mapDigit(digit, digitOffset))));
  puzzle.eliminated = transformArray(source.eliminated, transform, (digits) => new Set([...digits].map((digit) => mapDigit(digit, digitOffset))));
  puzzle.solution = transformArray(source.solution, transform, (digit) => mapDigit(digit, digitOffset));
  puzzle.history = [];
  return puzzle;
}

function transformArray(items, transform, mapValue) {
  const result = Array(81);
  items.forEach((value, index) => {
    const [row, col] = transform(Math.floor(index / 9), index % 9);
    result[row * 9 + col] = mapValue(value);
  });
  return result;
}

function createMutationNearMiss(fixture) {
  const puzzle = clonePuzzle(fixture.puzzle);
  const move = findAllMoves(puzzle, [fixture.technique]).find((candidate) => actionKey(candidate) === fixture.expectedAction) || fixture.move;
  if (fixture.technique === "Last Digit") {
    const target = move.fills[0].index;
    const targetUnits = UNITS.filter((unit) => (
      unit.cells.includes(target) && unit.cells.filter((cell) => !puzzle.values[cell]).length === 1
    ));
    for (const unit of targetUnits) {
      const second = unit.cells.find((cell) => cell !== target && puzzle.givens[cell]);
      puzzle.values[second] = 0;
      puzzle.givens[second] = false;
    }
  } else if (fixture.technique === "Naked Single") {
    addAlternateCandidate(puzzle, move.fills[0].index, move.fills[0].digit);
  } else if (fixture.technique === "Hidden Single") {
    const target = move.fills[0];
    const candidates = candidateSets(puzzle);
    const targetUnits = UNITS.filter((unit) => (
      unit.cells.includes(target.index)
      && unit.cells.filter((cell) => !puzzle.values[cell] && candidates[cell].has(target.digit)).length === 1
    ));
    for (const unit of targetUnits) {
      const alternate = unit.cells.find((cell) => cell !== target.index && !puzzle.values[cell]);
      makeCandidateLegal(puzzle, alternate, target.digit);
    }
  } else {
    const removable = move.evidence.filter(({ index, digit }) => digit && puzzle.solution?.[index] !== digit && candidateSets(puzzle)[index].has(digit));
    if (!removable.length) throw new Error(`No solution-safe evidence mutation for ${fixture.technique}.`);
    for (const candidate of removable) {
      puzzle.eliminated[candidate.index].add(candidate.digit);
      puzzle.notes[candidate.index].delete(candidate.digit);
      if (!findAllMoves(puzzle, [fixture.technique]).some((next) => actionKey(next) === fixture.expectedAction)) break;
    }
  }
  puzzle.history = [];
  let repeated = findAllMoves(puzzle, [fixture.technique]).some((candidate) => actionKey(candidate) === fixture.expectedAction);
  if (repeated && move.eliminations.length) {
    for (const elimination of move.eliminations) {
      puzzle.eliminated[elimination.index].add(elimination.digit);
      puzzle.notes[elimination.index].delete(elimination.digit);
    }
    repeated = findAllMoves(puzzle, [fixture.technique]).some((candidate) => actionKey(candidate) === fixture.expectedAction);
  }
  if (repeated) throw new Error(`Near miss still exposes the original ${fixture.technique} action.`);
  return { ...fixture, id: `${fixture.id}-near-miss`, puzzle, move: null, category: "near-miss" };
}

function addAlternateCandidate(puzzle, index, solutionDigit) {
  for (let digit = 1; digit <= 9; digit += 1) {
    if (digit === solutionDigit) continue;
    makeCandidateLegal(puzzle, index, digit);
    if (candidateSets(puzzle)[index].size > 1) return;
  }
  throw new Error("Could not create a Naked Single near miss.");
}

function makeCandidateLegal(puzzle, index, digit) {
  for (const peer of PEERS[index]) {
    if (puzzle.values[peer] === digit) {
      puzzle.values[peer] = 0;
      puzzle.givens[peer] = false;
    }
  }
  puzzle.eliminated[index].delete(digit);
}

function transformActionKey(key, transform, digitOffset) {
  return key.split("|").map((part) => {
    const match = part.match(/^([ef])(\d+)-(\d)$/);
    if (!match) return part;
    const index = Number(match[2]);
    const [row, col] = transform(Math.floor(index / 9), index % 9);
    return `${match[1]}${row * 9 + col}-${mapDigit(Number(match[3]), digitOffset)}`;
  }).join("|");
}

function mapDigit(digit, offset) {
  if (!digit) return 0;
  return ((digit - 1 + offset) % 9) + 1;
}

function actionKey(move) {
  return [
    move.technique,
    ...(move.fills || []).map(({ index, digit }) => `f${index}-${digit}`).sort(),
    ...(move.eliminations || []).map(({ index, digit }) => `e${index}-${digit}`).sort()
  ].join("|");
}

function effectKey(move) {
  return [
    ...(move.fills || []).map(({ index, digit }) => `f${index}-${digit}`).sort(),
    ...(move.eliminations || []).map(({ index, digit }) => `e${index}-${digit}`).sort()
  ].join("|");
}

function cloneMove(move) {
  return {
    ...move,
    cells: [...(move.cells || [])],
    evidence: (move.evidence || []).map((item) => ({ ...item })),
    eliminations: (move.eliminations || []).map((item) => ({ ...item })),
    fills: (move.fills || []).map((item) => ({ ...item }))
  };
}

function assertSolutionSafe(puzzle, move) {
  if (!puzzle.solution) throw new Error(`${move.technique} fixture lacks a known solution.`);
  for (const fill of move.fills || []) {
    if (puzzle.solution[fill.index] !== fill.digit) throw new Error(`${move.technique} fixture proposes a wrong fill.`);
  }
  for (const elimination of move.eliminations || []) {
    if (puzzle.solution[elimination.index] === elimination.digit) throw new Error(`${move.technique} fixture removes the solution candidate.`);
  }
}

function assertCommittedTechnique(technique) {
  if (!COMMITTED_COACHING_TECHNIQUES.includes(technique)) throw new Error(`Practice is not committed for ${technique}.`);
}

function practicePrerequisites(technique) {
  if (technique === "Last Digit") return [];
  if (technique === "Naked Single") return ["Last Digit"];
  if (technique === "Hidden Single") return ["Last Digit", "Naked Single"];
  if (technique === "Pointing Candidates") return SINGLE_TECHNIQUES;
  if (technique === "Claiming Candidates") return [...SINGLE_TECHNIQUES, "Pointing Candidates"];
  if (SUBSET_TECHNIQUES.includes(technique)) return [...SINGLE_TECHNIQUES, ...LOCKED_CANDIDATE_TECHNIQUES];
  const techniqueIndex = COMMITTED_COACHING_TECHNIQUES.indexOf(technique);
  return COMMITTED_COACHING_TECHNIQUES.slice(0, techniqueIndex);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function mod(value, length) {
  return ((Number(value) || 0) % length + length) % length;
}
