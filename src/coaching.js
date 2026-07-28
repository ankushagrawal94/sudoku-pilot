import {
  boxOf,
  candidateSets,
  cellName,
  colOf,
  getUnitLabel,
  PEERS,
  rowOf,
  UNITS
} from "./solver.js";
import { COMMITTED_COACHING_TECHNIQUES } from "./puzzles.js";

const SHARED_VISUAL_ROLES = [
  "given",
  "player",
  "ordinary-candidate",
  "evidence",
  "strong-link",
  "weak-link",
  "visibility-link",
  "elimination",
  "placement",
  "search-region"
];

const DEFINITIONS = [
  definition("Last Digit", "single", "Find a row, column, or block with exactly one empty cell.", "placement", "The row, column, or block is missing one digit, and its only empty cell must contain it."),
  definition("Naked Single", "single", "Find an empty cell with only one possible digit.", "placement", "Every other digit is already blocked by the cell's row, column, or block."),
  definition("Hidden Single", "single", "Find a missing digit with only one possible cell in a row, column, or block.", "placement", "The chosen digit is blocked from every other empty cell in that row, column, or block."),
  definition("Pointing Candidates", "locked-candidate", "In one block, find a digit whose possible cells all share one row or column.", "elimination", "The digit must occur on that row or column inside the block, so it cannot appear again beyond the block."),
  definition("Claiming Candidates", "locked-candidate", "In one row or column, find a digit whose possible cells all lie in one block.", "elimination", "The digit must occur inside that block on the chosen row or column, so it cannot appear elsewhere in the block."),
  definition("Naked Pair", "naked-subset", "Find two cells in one row, column, or block whose combined candidate lists contain only two digits.", "elimination", "The chosen cells provide two places for only two possible digits, so those digits must fill the cells and can be removed elsewhere in the row, column, or block."),
  definition("Hidden Pair", "hidden-subset", "Find two digits whose combined possible positions occupy exactly two cells in one row, column, or block.", "elimination", "The two digits need two different homes, and these are their only two cells. Both cells are reserved for those digits, so their other candidates can be removed."),
  definition("Naked Triple", "naked-subset", "Find three cells in one row, column, or block that use only three digits between them.", "elimination", "Those digits must fill the three cells, so they can be removed from the other cells nearby."),
  definition("Hidden Triple", "hidden-subset", "Find three digits whose combined possible positions occupy exactly three cells in one row, column, or block.", "elimination", "The three digits need three different homes, and these are their only three cells. All three cells are reserved for those digits, so their other candidates can be removed."),
  definition("Naked Quadruple", "naked-subset", "Find four cells in one row, column, or block that use only four digits between them.", "elimination", "Those digits must fill the four cells, so they can be removed from the other cells nearby."),
  definition("X-Wing", "fish", "For one digit, find two rows whose possible cells line up in the same two columns.", "elimination", "Each chosen row must place the digit in one of those columns, so the digit can be removed elsewhere in the columns."),
  definition("Swordfish", "fish", "For one digit, find three rows whose possible cells fit within the same three columns.", "elimination", "The chosen rows must place the digit in those columns, so the digit can be removed elsewhere in the columns."),
  definition("Skyscraper", "single-digit-link", "For one digit, find two two-place rows or columns with one pair lined up and two unaligned ends.", "elimination", "The lined-up cells cannot both be true, which forces at least one unaligned end to contain the digit."),
  definition("2-String Kite", "single-digit-link", "For one digit, connect a two-place row and a two-place column through one block.", "elimination", "The block connection forces at least one cell outside the block to contain the digit."),
  definition("XY-Wing", "wing", "Connect one two-candidate center cell to two two-candidate outer cells that share a third digit.", "elimination", "Either center value forces the shared digit into one outer cell, so a cell sharing a row, column, or block with both cannot keep it."),
  definition("XYZ-Wing", "wing", "Connect one three-candidate center cell to two two-candidate outer cells that use its digits.", "elimination", "The shared candidate must occur in the center or one outer cell, so a cell connected to all three cannot keep it."),
  definition("W-Wing", "wing", "Connect two matching two-candidate cells through a two-place link for one shared digit.", "elimination", "The connection forces one matching cell to take the other shared candidate, so a cell connected to both cannot keep it.")
];

export const COACHING_DEFINITIONS = Object.freeze(Object.fromEntries(DEFINITIONS.map((item) => [item.canonicalName, Object.freeze(item)])));

export function getCoachingDefinition(technique) {
  return COACHING_DEFINITIONS[technique] || null;
}

export function buildCoachingMove(move, puzzle) {
  const coachingDefinition = getCoachingDefinition(move.technique);
  if (!coachingDefinition) return null;
  const candidates = candidateSets(puzzle);
  const evidenceCandidates = uniqueCandidates((move.evidence || []).filter(({ index, digit }) => (
    digit && (puzzle.values[index] === digit || candidates[index]?.has(digit))
  )));
  const evidenceCells = uniqueNumbers((move.evidence || []).map(({ index }) => index));
  const relevantDigits = uniqueNumbers([
    ...evidenceCandidates.map(({ digit }) => digit),
    ...(move.eliminations || []).map(({ digit }) => digit),
    ...(move.fills || []).map(({ digit }) => digit)
  ]).sort((a, b) => a - b);
  const patternDigits = derivePatternDigits(move, evidenceCandidates);
  const relevantUnits = deriveUnits(move, coachingDefinition, evidenceCells, candidates);
  const focusDigit = chooseFocusDigit(patternDigits, evidenceCandidates, coachingDefinition);
  const relationships = deriveRelationships(move, coachingDefinition, candidates, relevantUnits);
  const actionCells = new Set([...(move.eliminations || []), ...(move.fills || [])].map(({ index }) => index));
  const structuralRelationships = relationships.filter(({ from, to }) => !actionCells.has(from.index) && !actionCells.has(to.index));
  const candidatePositions = deriveCandidatePositions(patternDigits, evidenceCandidates);
  const candidateLists = deriveCandidateLists(evidenceCandidates);
  const searchCells = uniqueNumbers(relevantUnits.flatMap(({ type, index }) => unitBy(type, index)?.cells || []));
  const stages = buildStages({
    move,
    definition: coachingDefinition,
    focusDigit,
    patternDigits,
    relevantDigits,
    relevantUnits,
    candidatePositions,
    candidateLists,
    searchCells
  });
  const structuralEvidenceCandidates = revealStructuralEvidence(coachingDefinition)
    ? evidenceCandidates.map((item) => ({ ...item }))
    : [];
  const coachingMove = {
    id: move.id,
    technique: move.technique,
    definition: coachingDefinition,
    patternType: coachingDefinition.patternType,
    patternDigits,
    relevantDigits,
    candidateSet: relevantDigits,
    relevantUnits,
    evidenceCells,
    evidenceCandidates,
    candidatePositions,
    candidateLists,
    structuralEvidenceCandidates,
    relationships,
    structuralRelationships,
    eliminations: (move.eliminations || []).map((item) => ({ ...item })),
    placements: (move.fills || []).map((item) => ({ ...item })),
    stages,
    exactExplanation: move.explanation,
    deeperExplanation: buildExactReason(move, coachingDefinition, patternDigits, candidateLists, relevantUnits),
    visualization: {
      roles: coachingDefinition.visualizationRoles,
      searchCells,
      evidenceCells,
      evidenceCandidates,
      structuralEvidenceCandidates,
      relationships,
      structuralRelationships,
      eliminations: (move.eliminations || []).map((item) => ({ ...item })),
      placements: (move.fills || []).map((item) => ({ ...item }))
    },
    supportedExceptions: coachingDefinition.supportedExceptions
  };
  validateCoachingMove(coachingMove);
  return coachingMove;
}

export function validateCoachingCatalog() {
  const names = Object.keys(COACHING_DEFINITIONS);
  if (names.length !== COMMITTED_COACHING_TECHNIQUES.length) throw new Error("Coaching catalog size does not match the committed catalog.");
  for (const technique of COMMITTED_COACHING_TECHNIQUES) {
    if (!COACHING_DEFINITIONS[technique]) throw new Error(`Missing coaching definition for ${technique}.`);
  }
  return true;
}

function definition(canonicalName, patternType, shortDefinition, actionType, whyItWorks) {
  return {
    id: canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    canonicalName,
    shortDefinition,
    patternType,
    actionType,
    whyItWorks,
    visualizationRoles: SHARED_VISUAL_ROLES,
    supportedExceptions: []
  };
}

function buildStages({ move, definition: item, focusDigit, patternDigits, relevantDigits, relevantUnits, candidatePositions, candidateLists, searchCells }) {
  const focus = buildSearchFocusMessage(move, item, focusDigit);
  const structural = buildStructuralMessage(move, item, focusDigit, patternDigits, relevantUnits, candidatePositions, candidateLists);
  return [
    { number: 1, kind: "technique", message: `Look for ${item.canonicalName}. ${item.shortDefinition}`, revealedDigits: [], revealedUnits: [], searchCells: [] },
    { number: 2, kind: "search-focus", message: focus, revealedDigits: focusDigit ? [focusDigit] : [], revealedUnits: [], searchCells: [] },
    { number: 3, kind: "structural-location", message: structural, revealedDigits: patternDigits, revealedUnits: relevantUnits, searchCells },
    { number: 4, kind: "exact-move", message: move.explanation, revealedDigits: relevantDigits, revealedUnits: relevantUnits, searchCells }
  ];
}

function buildSearchFocusMessage(move, item, focusDigit) {
  if (move.technique === "Last Digit") return "Start with a row, column, or block that has very few empty cells.";
  if (move.technique === "Naked Single") return "Start with an empty cell that has very few possible digits.";
  if (move.technique === "Hidden Single") return `Start with candidate ${focusDigit} and track every cell where it can go.`;
  if (item.patternType === "locked-candidate") return `Start with candidate ${focusDigit} and track every possible position for it inside one block or line.`;
  if (item.patternType === "naked-subset") return "Start with cells that have short candidate lists, then compare their complete lists.";
  if (item.patternType === "hidden-subset") return `Start with candidate ${focusDigit}, one of the chosen digits with the fewest possible positions. Track its possible cells, then compare other digits.`;
  if (item.patternType === "fish") return `Start with candidate ${focusDigit}. Count its possible positions in each row or, separately, in each column.`;
  if (move.technique === "Skyscraper") return `Start with candidate ${focusDigit}. Find rows or columns where it has exactly two possible cells.`;
  if (move.technique === "2-String Kite") return `Start with candidate ${focusDigit}. Find one row and one column where it has exactly two possible cells.`;
  if (move.technique === "XY-Wing") return "Start with a cell that has exactly two candidates. Treat it as a possible center and compare the two-candidate cells it sees.";
  if (move.technique === "XYZ-Wing") return "Start with a cell that has exactly three candidates. Compare the two-candidate cells it sees.";
  if (move.technique === "W-Wing") return "Start with two cells that have the same two candidates but do not see each other.";
  return focusDigit ? `Start with candidate ${focusDigit}.` : "Start with the empty cells.";
}

function derivePatternDigits(move, evidenceCandidates) {
  const evidenceDigits = uniqueNumbers(evidenceCandidates
    .filter(({ role }) => !["scan", "unit"].includes(role))
    .map(({ digit }) => digit)).sort((a, b) => a - b);
  if (evidenceDigits.length) return evidenceDigits;
  return uniqueNumbers([
    ...(move.fills || []).map(({ digit }) => digit),
    ...(move.eliminations || []).map(({ digit }) => digit)
  ]).sort((a, b) => a - b);
}

function chooseFocusDigit(patternDigits, evidenceCandidates, item) {
  if (!patternDigits.length) return null;
  if (item.patternType !== "hidden-subset") return patternDigits[0];
  const counts = new Map(patternDigits.map((digit) => [
    digit,
    uniqueNumbers(evidenceCandidates.filter((item) => item.digit === digit).map(({ index }) => index)).length
  ]));
  return [...patternDigits].sort((a, b) => (counts.get(a) || 9) - (counts.get(b) || 9) || a - b)[0];
}

function deriveCandidatePositions(patternDigits, evidenceCandidates) {
  return patternDigits.map((digit) => ({
    digit,
    cells: uniqueNumbers(evidenceCandidates.filter((item) => item.digit === digit).map(({ index }) => index))
  })).filter(({ cells }) => cells.length);
}

function deriveCandidateLists(evidenceCandidates) {
  const cells = uniqueNumbers(evidenceCandidates.map(({ index }) => index));
  return cells.map((index) => ({
    index,
    digits: uniqueNumbers(evidenceCandidates.filter((item) => item.index === index).map(({ digit }) => digit)).sort((a, b) => a - b),
    roles: uniqueStrings(evidenceCandidates.filter((item) => item.index === index).map(({ role }) => role))
  }));
}

function revealStructuralEvidence(item) {
  return ["naked-subset", "hidden-subset", "fish", "single-digit-link", "wing"].includes(item.patternType);
}

function buildStructuralMessage(move, item, focusDigit, patternDigits, relevantUnits, candidatePositions, candidateLists) {
  const unitText = formatUnitList(relevantUnits);
  const candidateText = formatCandidateList(patternDigits);
  if (move.technique === "Last Digit") return `Inspect ${unitText}. Count its empty cells and identify the one missing digit.`;
  if (move.technique === "Naked Single") return `Inspect ${unitText}. For each empty cell, compare its candidates with the digits already in its row, column, and block.`;
  if (move.technique === "Hidden Single") return `Within ${unitText}, mark every cell that could contain candidate ${focusDigit}. Check whether only one remains.`;
  if (item.patternType === "locked-candidate") {
    const block = formatUnitList(relevantUnits.filter(({ role }) => role === "source"));
    const line = formatUnitList(relevantUnits.filter(({ role }) => role === "line"));
    return move.technique === "Pointing Candidates"
      ? `Inside ${block}, check whether every candidate ${focusDigit} lines up in ${line}. Then follow ${line} beyond the block.`
      : `Along ${line}, check whether every candidate ${focusDigit} falls inside ${block}. Then inspect the rest of that block.`;
  }
  if (item.patternType === "naked-subset") {
    const size = { "Naked Pair": 2, "Naked Triple": 3, "Naked Quadruple": 4 }[move.technique];
    const count = ["", "one", "two", "three", "four"][size];
    const listText = candidateLists.map(({ index, digits }) => `${formatCellPosition(index)} {${digits.join(", ")}}`).join("; ");
    return `Within ${unitText}, compare the complete candidate lists: ${listText}. They do not need to match; combined, the ${count} cells use only ${candidateText}.`;
  }
  if (item.patternType === "hidden-subset") {
    const size = move.technique === "Hidden Pair" ? 2 : 3;
    const count = ["", "one", "two", "three"][size];
    const subsetUnit = relevantUnits.find(({ role }) => role === "subset");
    const positionText = candidatePositions
      .map(({ digit, cells }) => `${digit} → ${formatPositions(cells, subsetUnit)}`)
      .join("; ");
    return `Within ${unitText}, track each chosen digit separately: ${positionText}. Across the chosen digits, these possible positions occupy exactly ${count} cells.`;
  }
  if (item.patternType === "fish") {
    const baseUnits = relevantUnits.filter(({ role }) => role === "base");
    const bases = formatUnitList(baseUnits);
    const covers = formatUnitList(relevantUnits.filter(({ role }) => role === "cover"));
    const positionText = baseUnits.map((unit) => {
      const cells = candidatePositions.find(({ digit }) => digit === focusDigit)?.cells
        .filter((index) => unitBy(unit.type, unit.index).cells.includes(index)) || [];
      return `${unit.label} → ${formatPositions(cells, unit)}`;
    }).join("; ");
    return `Map candidate ${focusDigit} by line: ${positionText}. Across ${bases}, every possible position falls within ${covers}.`;
  }
  if (move.technique === "Skyscraper") return `In ${unitText}, candidate ${focusDigit} has exactly two possible cells in each chosen ${relevantUnits[0]?.type || "line"}. Find the lined-up pair and the two unaligned ends.`;
  if (move.technique === "2-String Kite") return `In ${unitText}, candidate ${focusDigit} has two possible cells in one row and two in one column. Find one cell from each pair that shares a block.`;
  if (move.technique === "XY-Wing" || move.technique === "XYZ-Wing") {
    const center = candidateLists.find(({ roles }) => roles.includes("pivot"))
      || (move.technique === "XYZ-Wing" ? candidateLists.find(({ digits }) => digits.length === 3) : null);
    const outer = candidateLists.filter(({ index, roles }) => index !== center?.index && roles.includes("wing"));
    const roleText = [
      center ? `center ${formatCellPosition(center.index)} {${center.digits.join(", ")}}` : "",
      ...outer.map(({ index, digits }) => `outer ${formatCellPosition(index)} {${digits.join(", ")}}`)
    ].filter(Boolean).join("; ");
    return `Compare the pattern roles: ${roleText}. ${move.technique === "XY-Wing" ? "Each outer cell shares a different center digit, and the outer cells share the candidate that will be forced." : "Both outer cells use only center digits and share the candidate that will be forced."}`;
  }
  if (move.technique === "W-Wing") {
    const matching = pairs(candidateLists.filter(({ digits }) => digits.length === 2))
      .find(([a, b]) => a.digits.join(",") === b.digits.join(",") && !PEERS[a.index].has(b.index));
    const matchingText = matching
      ? `${formatCellPosition(matching[0].index)} and ${formatCellPosition(matching[1].index)} both have {${matching[0].digits.join(", ")}}`
      : "two separate cells have the same candidate pair";
    const strongUnit = relevantUnits.find(({ role }) => role === "strong-link");
    const removedDigit = move.eliminations?.[0]?.digit;
    const linkDigit = matching?.[0].digits.find((digit) => digit !== removedDigit);
    return `${matchingText}. In ${strongUnit?.label || unitText}, candidate ${linkDigit || focusDigit} has exactly two possible cells, with one connected to each matching cell.`;
  }
  return unitText
    ? `Inspect ${unitText} and check the pattern's required counts and positions.`
    : `Inspect the highlighted region and check the pattern's required counts and positions.`;
}

function buildExactReason(move, item, patternDigits, candidateLists, relevantUnits) {
  const size = patternDigits.length;
  if (item.patternType === "hidden-subset") {
    const count = numberWord(size);
    return `The possible positions for ${formatDigitList(patternDigits)} occupy exactly ${count} cells. Those ${count} digits need ${count} different homes, so every one of those cells is reserved for them; if another digit occupied one, a chosen digit would have nowhere to go.`;
  }
  if (item.patternType === "naked-subset") {
    const count = numberWord(size);
    return `The chosen ${count} cells have only ${count} possible digits between them. Those digits must fill the chosen cells, leaving no place for any of them elsewhere in the same row, column, or block.`;
  }
  if (item.patternType === "fish") {
    const count = numberWord(move.technique === "X-Wing" ? 2 : 3);
    return `Each of the ${count} chosen lines must place candidate ${patternDigits[0]} once inside the ${count} crossing lines. That uses the one allowed copy in every crossing line, so the candidate cannot appear elsewhere in them.`;
  }
  if (move.technique === "Skyscraper") {
    return "The two lined-up candidates cannot both be true. If the first is false, its unaligned partner is true; if it is true, the other lined-up candidate is false and its partner is true. At least one unaligned end must contain the digit.";
  }
  if (move.technique === "2-String Kite") {
    return "The two candidates inside the shared block cannot both be true. Whichever inside candidate is false forces its outside partner to be true, so at least one outside end must contain the digit.";
  }
  if (move.technique === "XY-Wing") {
    const center = candidateLists.find(({ roles }) => roles.includes("pivot"));
    const forced = move.eliminations?.[0]?.digit;
    return `The center ${formatCandidateSet(center)} must take one of its two candidates. Either choice removes the matching candidate from one outer cell, forcing candidate ${forced} into that outer cell. At least one outer cell must therefore contain ${forced}.`;
  }
  if (move.technique === "XYZ-Wing") {
    const center = candidateLists.find(({ digits }) => digits.length === 3);
    const forced = move.eliminations?.[0]?.digit;
    return `If the center ${formatCandidateSet(center)} takes ${forced}, the center supplies it. If the center takes either other candidate, one outer cell is forced to ${forced}. The shared candidate must occur in one of the three pattern cells.`;
  }
  if (move.technique === "W-Wing") {
    const strongUnit = relevantUnits.find(({ role }) => role === "strong-link");
    const forced = move.eliminations?.[0]?.digit;
    const matching = pairs(candidateLists.filter(({ digits }) => digits.length === 2))
      .find(([a, b]) => a.digits.join(",") === b.digits.join(",") && !PEERS[a.index].has(b.index));
    const linkDigit = matching?.[0].digits.find((digit) => digit !== forced);
    const linkText = linkDigit || "the linking digit";
    return `The two-place link for ${linkDigit ? `candidate ${linkText}` : linkText} in ${strongUnit?.label || "the connecting line or block"} guarantees that one link end contains ${linkText}. That forces at least one matching cell to take ${forced}, so any cell that sees both matching cells cannot also contain ${forced}.`;
  }
  return item.whyItWorks;
}

function formatCandidateSet(item) {
  return item ? `at ${formatCellPosition(item.index)} {${item.digits.join(", ")}}` : "";
}

function formatPositions(cells, unit) {
  const indexes = unit?.type === "column"
    ? uniqueNumbers(cells.map(rowOf)).map((index) => index + 1)
    : unit?.type === "row"
      ? uniqueNumbers(cells.map(colOf)).map((index) => index + 1)
      : [];
  if (indexes.length) return `${unit.type === "column" ? "rows" : "columns"} ${formatNumberList(indexes)}`;
  return formatTextList(cells.map((index) => `row ${rowOf(index) + 1}, column ${colOf(index) + 1}`));
}

function formatCellPosition(index) {
  return `row ${rowOf(index) + 1}, column ${colOf(index) + 1}`;
}

function formatDigitList(digits) {
  return formatNumberList(digits);
}

function formatNumberList(numbers) {
  if (numbers.length <= 1) return String(numbers[0] ?? "");
  if (numbers.length === 2) return `${numbers[0]} and ${numbers[1]}`;
  return `${numbers.slice(0, -1).join(", ")}, and ${numbers.at(-1)}`;
}

function formatTextList(items) {
  if (items.length <= 1) return String(items[0] ?? "");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function numberWord(size) {
  return ["zero", "one", "two", "three", "four"][size] || String(size);
}

function formatCandidateList(digits) {
  if (!digits.length) return "the highlighted candidates";
  if (digits.length === 1) return `candidate ${digits[0]}`;
  if (digits.length === 2) return `candidates ${digits[0]} and ${digits[1]}`;
  return `candidates ${digits.slice(0, -1).join(", ")}, and ${digits.at(-1)}`;
}

function deriveUnits(move, item, evidenceCells, candidates) {
  const actionCells = [...(move.eliminations || []), ...(move.fills || [])].map(({ index }) => index);
  const units = [];
  const add = (unit, role) => {
    if (!unit || units.some((entry) => entry.type === unit.type && entry.index === unit.index && entry.role === role)) return;
    units.push({ type: unit.type, index: unit.index, label: getUnitLabel(unit.type, unit.index), role });
  };
  if (item.patternType === "single") {
    const fullUnit = UNITS.find((unit) => unit.cells.every((index) => evidenceCells.includes(index)));
    if (fullUnit) add(fullUnit, "search");
    else add(unitBy("block", boxOf((move.fills || [])[0]?.index || evidenceCells[0] || 0)), "search");
  } else if (item.patternType === "locked-candidate") {
    add(commonUnit(evidenceCells, "block"), "source");
    add(commonUnit(evidenceCells, "row") || commonUnit(evidenceCells, "column"), "line");
    add(commonUnit(actionCells, "block"), "destination");
    add(commonUnit(actionCells, "row") || commonUnit(actionCells, "column"), "destination");
  } else if (["naked-subset", "hidden-subset"].includes(item.patternType)) {
    add(commonUnit(evidenceCells), "subset");
  } else if (item.patternType === "fish") {
    const size = move.technique === "X-Wing" ? 2 : 3;
    const orientation = fishOrientation(evidenceCells, size);
    if (orientation) {
      const baseIndexes = uniqueNumbers(evidenceCells.map((index) => orientation === "row" ? rowOf(index) : colOf(index)));
      const coverIndexes = uniqueNumbers(evidenceCells.map((index) => orientation === "row" ? colOf(index) : rowOf(index)));
      baseIndexes.forEach((index) => add(unitBy(orientation, index), "base"));
      coverIndexes.forEach((index) => add(unitBy(orientation === "row" ? "column" : "row", index), "cover"));
    }
  } else if (item.patternType === "single-digit-link") {
    const types = move.technique === "2-String Kite"
      ? ["row", "column"]
      : ["row", "column"].filter((type) => groupedPairs(evidenceCells, type).length === 2);
    for (const type of types) {
      groupedPairs(evidenceCells, type).forEach(([, index]) => add(unitBy(type, index), "strong-link"));
    }
  } else if (item.patternType === "wing") {
    if (move.technique === "W-Wing") {
      const bivalue = evidenceCells.filter((cell) => candidates[cell]?.size === 2);
      const matching = pairs(bivalue).find(([a, b]) => sameSet(candidates[a], candidates[b]) && !PEERS[a].has(b));
      if (matching) {
        for (const digit of candidates[matching[0]]) {
          const strongUnit = UNITS.find((unit) => {
            const places = unit.cells.filter((cell) => candidates[cell]?.has(digit));
            return places.length === 2 && (
              (PEERS[matching[0]].has(places[0]) && PEERS[matching[1]].has(places[1])) ||
              (PEERS[matching[0]].has(places[1]) && PEERS[matching[1]].has(places[0]))
            );
          });
          if (strongUnit) add(strongUnit, "strong-link");
        }
      }
    }
    const keyCells = uniqueNumbers(evidenceCells);
    for (const [a, b] of pairs(keyCells)) {
      const shared = sharedUnit(a, b);
      if (shared) add(shared, "visibility");
    }
  }
  return units;
}

function deriveRelationships(move, item, candidates, relevantUnits) {
  const evidence = move.evidence || [];
  const focusDigit = uniqueNumbers([
    ...evidence.map(({ digit }) => digit),
    ...(move.eliminations || []).map(({ digit }) => digit)
  ])[0];
  const relationships = [];
  const add = (kind, from, to, unit = null, digit = focusDigit) => {
    if (from === undefined || to === undefined || from === to) return;
    const key = `${kind}:${Math.min(from, to)}:${Math.max(from, to)}:${digit || 0}`;
    if (relationships.some((entry) => entry.key === key)) return;
    relationships.push({ key, kind, from: { index: from, digit }, to: { index: to, digit }, unit });
  };
  if (item.patternType === "fish") {
    for (const unit of relevantUnits.filter(({ role }) => role === "base")) {
      const cells = evidence.filter(({ index, digit }) => digit === focusDigit && unitBy(unit.type, unit.index).cells.includes(index)).map(({ index }) => index);
      for (const [from, to] of pairs(uniqueNumbers(cells))) add("pattern", from, to, unit);
    }
  }
  if (item.patternType === "single-digit-link") {
    for (const unit of relevantUnits.filter(({ role }) => role === "strong-link")) {
      const logical = unitBy(unit.type, unit.index).cells.filter((index) => candidates[index]?.has(focusDigit));
      if (logical.length === 2) add("strong", logical[0], logical[1], unit);
    }
    const strong = relationships.filter(({ kind }) => kind === "strong");
    if (strong.length >= 2) {
      const first = [strong[0].from.index, strong[0].to.index];
      const second = [strong[1].from.index, strong[1].to.index];
      const connected = first.flatMap((a) => second.map((b) => [a, b]))
        .find(([a, b]) => move.technique === "2-String Kite"
          ? boxOf(a) === boxOf(b)
          : strong[0].unit?.type === "row" ? colOf(a) === colOf(b) : rowOf(a) === rowOf(b));
      if (connected) {
        add("weak", connected[0], connected[1], sharedUnit(connected[0], connected[1]));
        const farA = first.find((cell) => cell !== connected[0]);
        const farB = second.find((cell) => cell !== connected[1]);
        for (const target of (move.eliminations || []).map(({ index }) => index)) {
          if (PEERS[target].has(farA)) add("visibility", farA, target, sharedUnit(farA, target));
          if (PEERS[target].has(farB)) add("visibility", farB, target, sharedUnit(farB, target));
        }
      }
    }
  }
  if (move.technique === "W-Wing") {
    const bivalue = uniqueNumbers(evidence.map(({ index }) => index).filter((cell) => candidates[cell]?.size === 2));
    const matching = pairs(bivalue).find(([a, b]) => sameSet(candidates[a], candidates[b]) && !PEERS[a].has(b));
    for (const unit of relevantUnits.filter(({ role }) => role === "strong-link")) {
      for (const digit of matching ? candidates[matching[0]] : []) {
        const places = unitBy(unit.type, unit.index).cells.filter((cell) => candidates[cell]?.has(digit));
        if (places.length !== 2) continue;
        add("strong", places[0], places[1], unit, digit);
        if (matching) {
          const [a, b] = matching;
          const [first, second] = PEERS[a].has(places[0]) && PEERS[b].has(places[1]) ? places : [places[1], places[0]];
          add("visibility", a, first, sharedUnit(a, first), digit);
          add("visibility", b, second, sharedUnit(b, second), digit);
        }
      }
    }
  }
  if (item.patternType === "wing") {
    const pivot = evidence.find(({ role }) => role === "pivot")?.index;
    const wingCells = uniqueNumbers(evidence.filter(({ role }) => role === "wing").map(({ index }) => index));
    if (pivot !== undefined) wingCells.forEach((wing) => add("visibility", pivot, wing, sharedUnit(pivot, wing)));
    for (const target of (move.eliminations || []).map(({ index }) => index)) {
      wingCells.filter((wing) => PEERS[target].has(wing)).forEach((wing) => add("visibility", wing, target, sharedUnit(wing, target)));
    }
  }
  return relationships.map(({ key, ...relationship }) => relationship);
}

function validateCoachingMove(move) {
  if (!COMMITTED_COACHING_TECHNIQUES.includes(move.technique)) throw new Error(`Uncommitted coaching technique: ${move.technique}`);
  if (move.stages.length !== 4 || move.stages.some((stage, index) => stage.number !== index + 1)) throw new Error(`${move.technique} must have four ordered stages.`);
  if (!move.exactExplanation || (!move.eliminations.length && !move.placements.length)) throw new Error(`${move.technique} is missing an exact explained action.`);
  if (!move.evidenceCells.length) throw new Error(`${move.technique} is missing evidence cells.`);
}

function fishOrientation(cells, size) {
  const rows = uniqueNumbers(cells.map(rowOf));
  const columns = uniqueNumbers(cells.map(colOf));
  if (rows.length === size && columns.length === size) return "row";
  if (columns.length === size && rows.length === size) return "column";
  return rows.length === size ? "row" : columns.length === size ? "column" : null;
}

function groupedPairs(cells, type) {
  const groups = new Map();
  cells.forEach((cell) => {
    const index = type === "row" ? rowOf(cell) : type === "column" ? colOf(cell) : boxOf(cell);
    const group = groups.get(index) || [];
    group.push(cell);
    groups.set(index, group);
  });
  return [...groups].filter(([, group]) => uniqueNumbers(group).length === 2).map(([index, group]) => [uniqueNumbers(group), index]);
}

function commonUnit(cells, preferred = null) {
  if (!cells.length) return null;
  return UNITS.find((unit) => (!preferred || unit.type === preferred) && cells.every((index) => unit.cells.includes(index))) || null;
}

function sharedUnit(a, b) {
  return UNITS.find((unit) => unit.cells.includes(a) && unit.cells.includes(b)) || null;
}

function unitBy(type, index) {
  return UNITS.find((unit) => unit.type === type && unit.index === index);
}

function formatUnitList(units) {
  const labels = uniqueStrings(units.map(({ label }) => label));
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function uniqueCandidates(items) {
  const seen = new Set();
  return items.filter(({ index, digit }) => {
    const key = `${index}:${digit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item) => ({ ...item }));
}

function uniqueNumbers(items) {
  return [...new Set(items.filter((item) => Number.isInteger(item)))];
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

function pairs(items) {
  const result = [];
  for (let a = 0; a < items.length; a += 1) {
    for (let b = a + 1; b < items.length; b += 1) result.push([items[a], items[b]]);
  }
  return result;
}

function sameSet(a, b) {
  return a?.size === b?.size && [...a].every((value) => b.has(value));
}

validateCoachingCatalog();
