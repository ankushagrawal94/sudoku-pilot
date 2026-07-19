import { COACHING_DEFINITIONS } from "./coaching.js";
import { COMMITTED_COACHING_TECHNIQUES } from "./puzzles.js";

export const LEARNER_GLOSSARY = Object.freeze({
  candidate: Object.freeze({
    term: "Candidate",
    definition: "A digit that can still legally go in an empty cell. Candidate digits are shown as small pencil marks."
  }),
  sees: Object.freeze({
    term: "Sees",
    definition: "A cell sees another cell when they share a row, column, or 3×3 block. Two cells that see each other cannot contain the same digit."
  }),
  "strong-link": Object.freeze({
    term: "Strong link",
    definition: "For one digit, a row, column, or block has exactly two possible cells. One of those two cells must contain the digit."
  }),
  pivot: Object.freeze({
    term: "Pivot",
    definition: "The center cell in a wing pattern. Its possible digits determine what must happen in the two outer cells."
  }),
  wing: Object.freeze({
    term: "Wing",
    definition: "One of the two outer cells in a wing pattern. Each wing shares a candidate with the pivot."
  })
});

const LESSON_DETAILS = {
  "Last Digit": lesson(
    "Look for a row, column, or 3×3 block with exactly one empty cell.",
    ["Choose a row, column, or block with one empty cell.", "Compare the digits already there with 1 through 9.", "Place the only missing digit in the empty cell."],
    ["Exactly one cell is empty in the chosen row, column, or block.", "The missing digit is not already present in the cell's other row, column, or block."],
    "Every row, column, and block must contain the digits 1 through 9 exactly once. With one empty cell, the one missing digit has only one place to go.",
    "The unit is a permutation of 1 through 9; the sole absent value is forced into the sole absent position.",
    "Place one digit",
    "Know how rows, columns, and 3×3 blocks are arranged.",
    "Two empty cells are not a Last Digit, even if one of them looks easy. This technique requires exactly one empty cell in the chosen row, column, or block.",
    ["Starting before confirming that exactly one cell is empty.", "Forgetting to check the empty cell's other row, column, or block."]
  ),
  "Naked Single": lesson(
    "Look for an empty cell where its row, column, and block rule out every digit except one.",
    ["Choose an empty cell with only a few candidates.", "Cross out every digit already used in its row, column, or block.", "If exactly one digit remains possible, place it in the cell."],
    ["Exactly one legal candidate remains after checking the row, column, and block.", "The conclusion comes from the puzzle rules, not from an incomplete set of player notes."],
    "Every other digit would repeat a digit in the same row, column, or block. The one remaining candidate is therefore forced.",
    "The legal-candidate set for the cell has cardinality one.",
    "Place one digit",
    "Know how candidate pencil marks show the digits that can still fit in a cell.",
    "A cell with two legal candidates is not a Naked Single, even if one candidate feels more likely. Both possibilities must remain until logic removes one.",
    ["Trusting an incomplete pencil-note list as proof.", "Checking the row but forgetting the column or block."],
    ["candidate"]
  ),
  "Hidden Single": lesson(
    "Choose a missing digit and find every cell where it could go within one row, column, or block.",
    ["Choose a row, column, or block and one digit missing from it.", "Check every empty cell there and mark where the digit can legally go.", "If only one cell can take the digit, place it there."],
    ["The chosen digit is missing from the row, column, or block.", "Every empty cell except one is blocked for that digit by its crossing row, column, or block."],
    "The target cell may have several candidates, but the chosen digit has no other possible home in that row, column, or block.",
    "For a missing digit d, the set of legal cells in the unit contains exactly one member.",
    "Place one digit",
    "Know how to scan one row, column, or block for a chosen candidate.",
    "Two legal positions for the digit are a near miss. Neither can be chosen until another deduction removes one position.",
    ["Looking only for cells with one note instead of tracking one digit's possible cells.", "Treating incomplete player notes as a complete list of possibilities."],
    ["candidate"]
  ),
  "Pointing Candidates": lesson(
    "Inside one 3×3 block, look for a digit whose possible cells all lie in the same row or the same column.",
    ["Choose a block and one digit missing from it.", "Mark every cell inside the block where that digit could go.", "If all marked cells share one row or column, follow it beyond the block.", "Remove the digit from other cells on that row or column outside the block."],
    ["There is no possible cell for the digit elsewhere in the block, off the shared row or column.", "Only cells on the shared row or column and outside the chosen block lose the candidate."],
    "The block must contain the digit in one of its marked cells. Because those cells share a row or column, the digit cannot appear again on that row or column outside the block.",
    "The block candidates imply the disjunction of their cells; every cell in that disjunction belongs to the same line, so the line excludes the digit elsewhere.",
    "Remove impossible candidates",
    "Know how to scan a block for every possible cell of one candidate.",
    "If even one possible cell inside the block sits off the shared row or column, the pattern is invalid and nothing can be removed outside the block.",
    ["Removing candidates inside the chosen block instead of beyond it.", "Using only the pencil marks that happen to be written instead of all legal possibilities."],
    ["candidate"]
  ),
  "Claiming Candidates": lesson(
    "Inside one row or column, look for a digit whose possible cells all fall in the same 3×3 block.",
    ["Choose a row or column and one digit missing from it.", "Mark every cell on that row or column where the digit could go.", "If all marked cells are inside one block, inspect the rest of that block.", "Remove the digit from cells in that block but outside the chosen row or column."],
    ["There is no possible cell for the digit on the chosen row or column outside the block.", "Only cells inside the block and outside the chosen row or column lose the candidate."],
    "The row or column must contain the digit in the shared block. The block cannot contain another copy, so the digit can be removed from the rest of that block.",
    "The line candidates imply a placement within one block, so the block excludes the digit from its cells outside that line.",
    "Remove impossible candidates",
    "Know how to scan a row or column for every possible cell of one candidate.",
    "If the digit has even one possible cell on the chosen row or column outside the block, the pattern is invalid and nothing can be removed from the block.",
    ["Starting from a block; Claiming starts from a row or column.", "Removing candidates from the chosen row or column instead of the rest of the block."],
    ["candidate"]
  ),
  "Naked Pair": nakedGroupLesson("two", 2, "Pair", "Two cells must contain the same two digits in some order, so those digits cannot appear in another cell in the same row, column, or block.", "If either chosen cell has a third candidate, the two cells do not form a Naked Pair."),
  "Hidden Pair": hiddenGroupLesson("two", 2, "Pair", "The two chosen digits have only two possible cells between them. Those cells must contain the two digits, so their other candidates can be removed.", "If either chosen digit can go in a third cell in the same row, column, or block, the highlighted cells are not a Hidden Pair."),
  "Naked Triple": nakedGroupLesson("three", 3, "Triple", "Three cells must contain the same three digits in some order, so those digits cannot appear in another cell in the same row, column, or block.", "Three cells with four different candidates between them are not a Naked Triple."),
  "Hidden Triple": hiddenGroupLesson("three", 3, "Triple", "The three chosen digits have only three possible cells between them. Those cells must contain the three digits, so their other candidates can be removed.", "If any chosen digit can go in a fourth cell in the same row, column, or block, the highlighted cells are not a Hidden Triple."),
  "Naked Quadruple": nakedGroupLesson("four", 4, "Quadruple", "Four cells must contain the same four digits in some order, so those digits cannot appear in another cell in the same row, column, or block.", "Four cells with five different candidates between them are not a Naked Quadruple."),
  "X-Wing": fishLesson("two", 2, "X-Wing", "Each chosen row must place the digit in one of the same two columns. Those columns will receive the digit from the chosen rows, so it can be removed from their other cells.", "If either chosen row has a third possible cell, or the two rows use different columns, the rectangle is not an X-Wing."),
  "Swordfish": fishLesson("three", 3, "Swordfish", "The three chosen rows must place the digit somewhere in the same three columns. Those columns will receive all three copies from the chosen rows, so the digit can be removed elsewhere in them.", "If the possible cells spread across four columns, the pattern is not a Swordfish."),
  "Skyscraper": lesson(
    "For one digit, find two rows with exactly two possible cells each. One cell from each row lines up in the same column; the other two do not.",
    ["Choose one digit and scan either rows or columns for strong links.", "Choose two strong links with exactly one pair of cells lined up.", "Find the two unaligned cells at the other ends of the links.", "Remove the digit from any candidate cell that sees both unaligned cells."],
    ["Each chosen row or column has exactly two possible cells for the same digit.", "Exactly one cell from each pair lines up, and the candidate to remove sees both unaligned cells."],
    "The two lined-up cells cannot both contain the digit. If the first one is false, its unaligned partner is true. If it is true, the other lined-up cell is false, making its partner true. At least one unaligned cell is always true.",
    "The two strong-link disjunctions share a cover position, forcing at least one far endpoint true.",
    "Remove impossible candidates",
    "Be comfortable scanning one digit. The terms below explain candidate, sees, and strong link.",
    "A row or column with three possible cells is not a strong link. A candidate that sees only one unaligned cell cannot be removed.",
    ["Using two possible cells that are not the only possibilities on their row or column.", "Removing the digit from a cell that sees only one unaligned end."],
    ["candidate", "sees", "strong-link"]
  ),
  "2-String Kite": lesson(
    "For one digit, find a strong link in a row and another in a column. One cell from each pair must lie in the same 3×3 block.",
    ["Choose one digit and find a row where it has exactly two possible cells.", "Find a column where it also has exactly two possible cells.", "Check that one cell from each pair lies in the same block.", "Remove the digit from a candidate cell that sees both cells outside that shared block."],
    ["The row and column each have exactly two possible cells for the same digit.", "One cell from each pair shares a block, and the candidate to remove sees both cells outside that block."],
    "The shared block cannot contain the digit twice. Whichever inside cell is not the digit makes its partner outside the block true. At least one outside cell must contain the digit, so a cell seeing both cannot.",
    "Two conjugate pairs joined by a block weak link force the disjunction of the remote endpoints.",
    "Remove impossible candidates",
    "Be comfortable scanning one digit across rows, columns, and blocks. The terms below explain candidate, sees, and strong link.",
    "If one cell from each pair does not share a block, the two links are not connected and no removal follows.",
    ["Using a row or column where the digit has three possible cells.", "Checking a cell that sees the two inside cells instead of the two outside cells."],
    ["candidate", "sees", "strong-link"]
  ),
  "XY-Wing": lesson(
    "Find a two-candidate pivot that sees two two-candidate wings. Each wing shares a different pivot digit, and both wings share one extra digit.",
    ["Choose a two-candidate cell to be the pivot.", "Find one wing that sees the pivot and shares its first candidate.", "Find a second wing that sees the pivot, shares its other candidate, and shares one candidate with the first wing.", "Remove the wings' shared candidate from any cell that sees both wings."],
    ["The pivot and both wings each have exactly two candidates.", "The pivot sees both wings, and the candidate to remove sees both wings."],
    "Whichever candidate fills the pivot forces the shared wing candidate into one of the two wings. Because one wing must contain that digit, a cell that sees both wings cannot contain it.",
    "The pivot's exhaustive binary choice implies Z in at least one wing.",
    "Remove impossible candidates",
    "Be comfortable with two-candidate cells. The terms below explain candidate, sees, pivot, and wing.",
    "If either wing does not see the pivot, or the wings do not share the same extra candidate, the pattern is invalid.",
    ["Requiring the two wings to see each other; only the pivot must see both.", "Using a pivot with three candidates."],
    ["candidate", "sees", "pivot", "wing"]
  ),
  "XYZ-Wing": lesson(
    "Find a three-candidate pivot that sees two two-candidate wings. Every wing candidate comes from the pivot, and the wings share one candidate.",
    ["Choose a three-candidate cell to be the pivot.", "Find two two-candidate wings that see the pivot and use only its three candidates.", "Check that the two wings share one candidate.", "Remove that shared candidate only from cells that see the pivot and both wings."],
    ["The pivot has exactly three candidates, and each wing has exactly two chosen from those three.", "The candidate to remove sees all three pattern cells: the pivot and both wings."],
    "If the pivot takes the shared candidate, that digit is already present. If it takes either other candidate, one wing is forced to take the shared candidate. One of the three pattern cells must always contain it.",
    "The pivot's three exhaustive values imply Z in the pivot or one corresponding wing.",
    "Remove impossible candidates",
    "Understand XY-Wing first. The terms below explain candidate, sees, pivot, and wing.",
    "A candidate cell that sees the two wings but not the pivot is a near miss. Unlike XY-Wing, the cell must see all three pattern cells.",
    ["Using a pivot with only two candidates.", "Forgetting that the candidate to remove must also see the pivot."],
    ["candidate", "sees", "pivot", "wing"]
  ),
  "W-Wing": lesson(
    "Find two cells with the same two candidates that do not see each other. Connect one shared candidate through a strong link between them.",
    ["Find two separate two-candidate cells with the same candidate pair.", "Confirm that those two cells do not see each other.", "For one shared candidate, find a strong link with one end seeing each matching cell.", "Remove the other shared candidate from any cell that sees both matching cells."],
    ["The two matching cells contain exactly the same two candidates and do not see each other.", "The connecting strong link has one end seeing each matching cell, and the candidate to remove sees both matching cells."],
    "One end of the strong link must contain its digit. That forces at least one matching cell to take the other shared candidate, so a cell seeing both matching cells cannot contain that candidate.",
    "A conjugate pair transfers a binary implication between two equal bivalue cells.",
    "Remove impossible candidates",
    "Be comfortable with two-candidate cells. The terms below explain candidate, sees, and strong link.",
    "If the connecting row, column, or block has three possible cells for the linking digit, it is not a strong link and the pattern is invalid.",
    ["Using two outer cells with different candidate pairs.", "Using a connection where the linking digit has more than two possible cells."],
    ["candidate", "sees", "strong-link"]
  )
};

export const TECHNIQUE_LESSONS = Object.freeze(Object.fromEntries(COMMITTED_COACHING_TECHNIQUES.map((technique) => {
  const definition = COACHING_DEFINITIONS[technique];
  const detail = LESSON_DETAILS[technique];
  if (!definition || !detail) throw new Error(`Missing structured lesson for ${technique}.`);
  return [technique, Object.freeze({
    id: definition.id,
    technique,
    tier: COMMITTED_COACHING_TECHNIQUES.indexOf(technique) < 10 ? 1 : 2,
    whatItIs: {
      definition: definition.shortDefinition,
      outcome: detail.outcome,
      prerequisites: detail.prerequisites,
      terms: detail.termKeys.map((key) => LEARNER_GLOSSARY[key])
    },
    howToRecognize: {
      introduction: detail.introduction,
      steps: detail.steps,
      conditions: detail.conditions
    },
    whyItWorks: {
      plain: detail.plain,
      formal: detail.formal
    },
    workedExample: {
      progression: ["technique", "search focus", "structural location", "exact explained move"],
      fixtureSource: "certified-practice"
    },
    commonMistakes: {
      nearMiss: detail.nearMiss,
      items: detail.mistakes
    },
    tryIt: {
      mode: "find-pattern",
      label: `Practice ${technique}`
    }
  })];
})));

export function getTechniqueLesson(technique) {
  return TECHNIQUE_LESSONS[technique] || null;
}

export function validateLessonCatalog() {
  const lessonNames = Object.keys(TECHNIQUE_LESSONS);
  if (lessonNames.length !== COMMITTED_COACHING_TECHNIQUES.length) throw new Error("Lesson catalog size does not match the committed catalog.");
  for (const technique of COMMITTED_COACHING_TECHNIQUES) {
    const item = TECHNIQUE_LESSONS[technique];
    if (!item) throw new Error(`Missing lesson for ${technique}.`);
    for (const section of ["whatItIs", "howToRecognize", "whyItWorks", "workedExample", "commonMistakes", "tryIt"]) {
      if (!item[section]) throw new Error(`${technique} is missing ${section}.`);
    }
    if (!item.whyItWorks.plain || !item.commonMistakes.nearMiss || item.howToRecognize.steps.length < 3 || !Array.isArray(item.whatItIs.terms)) {
      throw new Error(`${technique} lesson content is incomplete.`);
    }
  }
  return true;
}

function lesson(introduction, steps, conditions, plain, formal, outcome, prerequisites, nearMiss, mistakes, termKeys = []) {
  return { introduction, steps, conditions, plain, formal, outcome, prerequisites, nearMiss, mistakes, termKeys };
}

function nakedGroupLesson(numberWord, size, title, plain, nearMiss) {
  return lesson(
    `In one row, column, or block, find ${numberWord} cells that between them can contain only ${numberWord} different digits.`,
    [`Choose a row, column, or block with several empty cells.`, `Compare candidate lists and find ${numberWord} cells using only the same ${numberWord} digits between them.`, `Confirm that none of the chosen cells has a candidate outside that group.`, `Remove those ${numberWord} digits from every other cell in the same row, column, or block.`],
    [`Exactly ${numberWord} cells use exactly ${numberWord} different candidates between them.`, `At least one other cell in the same row, column, or block contains one of those candidates.`],
    plain,
    `A set of ${size} cells with a candidate union of size ${size} must take all ${size} digits by the one-of-each unit rule.`,
    "Remove impossible candidates",
    `Know how candidate pencil marks work. For a Naked ${title}, count the cells and the different digits across them.`,
    nearMiss,
    [`Expecting every chosen cell to show every chosen digit; the combined list is what matters.`, `Combining cells from different rows, columns, or blocks.`],
    ["candidate"]
  );
}

function hiddenGroupLesson(numberWord, size, title, plain, nearMiss) {
  return lesson(
    `In one row, column, or block, find ${numberWord} digits that can go only in the same ${numberWord} cells.`,
    [`Choose ${numberWord} missing digits in one row, column, or block.`, `Mark every cell where each chosen digit could go.`, `Confirm that all of those marks fit inside the same ${numberWord} cells.`, `Keep the chosen digits in those cells and remove their other candidates.`],
    [`Each chosen digit appears only in the same group of ${numberWord} cells.`, `The chosen cells contain at least one other candidate that can be removed.`],
    plain,
    `${size} digits restricted to ${size} positions form a bijection, so no outside digit can occupy those positions.`,
    "Remove impossible candidates",
    `Know how candidate pencil marks work. For a Hidden ${title}, track the chosen digits instead of looking for matching cell lists.`,
    nearMiss,
    ["Looking for matching candidate lists instead of tracking where the chosen digits can go.", "Missing an extra possible cell for one chosen digit elsewhere in the row, column, or block."],
    ["candidate"]
  );
}

function fishLesson(numberWord, size, name, plain, nearMiss) {
  const maximum = size === 2 ? "exactly two" : "two or three";
  return lesson(
    `Choose one digit and find ${numberWord} rows whose possible cells all fall in the same ${numberWord} columns. You can also start with columns and swap the directions.`,
    [`Choose one candidate digit and scan it across all rows.`, `Find ${numberWord} rows where the digit has ${maximum} possible cells.`, `Check that every possible cell in those rows falls within the same ${numberWord} columns.`, `Remove the digit from other cells in those columns, outside the chosen rows.`],
    [`Every marked cell uses the same candidate digit.`, `The chosen ${numberWord} rows use exactly ${numberWord} columns between them.`, `Only cells in those columns and outside the chosen rows lose the candidate.`],
    plain,
    `The ${size} base lines must place the digit once each within ${size} cover lines, consuming the digit's one allowed occurrence in every cover line.`,
    "Remove impossible candidates",
    `Know how to scan one candidate across rows and columns. ${name} builds on Pointing and Claiming Candidates.`,
    nearMiss,
    [`Starting with rows for part of the pattern and columns for the rest.`, `Ignoring an extra possible cell outside the required ${numberWord} crossing columns.`],
    ["candidate"]
  );
}

validateLessonCatalog();
