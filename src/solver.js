import { ALL_TECHNIQUES, TECHNIQUE_DESCRIPTIONS } from "./puzzles.js";

export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const RANGE = Array.from({ length: 81 }, (_, index) => index);

export const UNITS = buildUnits();
export const PEERS = buildPeers();

export function parseGrid(grid) {
  return grid
    .replace(/[^0-9.\-]/g, "")
    .slice(0, 81)
    .padEnd(81, "0")
    .split("")
    .map((char) => (char === "." || char === "-" ? 0 : Number(char)));
}

export function createPuzzle(grid, solution = "") {
  const values = parseGrid(grid);
  return {
    values,
    givens: values.map((value) => value > 0),
    notes: values.map(() => new Set()),
    eliminated: values.map(() => new Set()),
    history: [],
    solution: solution ? parseGrid(solution) : null
  };
}

export function clonePuzzle(puzzle) {
  return {
    values: [...puzzle.values],
    givens: [...puzzle.givens],
    notes: puzzle.notes.map((noteSet) => new Set(noteSet)),
    eliminated: normalizeCandidateState(puzzle.eliminated),
    history: puzzle.history ? [...puzzle.history] : [],
    solution: puzzle.solution ? [...puzzle.solution] : null
  };
}

export function rowOf(index) {
  return Math.floor(index / 9);
}

export function colOf(index) {
  return index % 9;
}

export function boxOf(index) {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3);
}

export function cellName(index) {
  return `r${rowOf(index) + 1}c${colOf(index) + 1}`;
}

export function getUnitLabel(type, index) {
  return `${type} ${index + 1}`;
}

export function legalCandidates(values, index) {
  if (values[index]) return new Set();
  const used = new Set();
  for (const peer of PEERS[index]) {
    if (values[peer]) used.add(values[peer]);
  }
  return new Set(DIGITS.filter((digit) => !used.has(digit)));
}

export function candidateSets(puzzle) {
  return RANGE.map((index) => {
    if (puzzle.values[index]) return new Set();
    const legal = legalCandidates(puzzle.values, index);
    for (const digit of puzzle.eliminated?.[index] || []) legal.delete(digit);
    return legal;
  });
}

export function fillAllNotes(puzzle) {
  const candidates = candidateSets(puzzle);
  for (const index of RANGE) puzzle.notes[index] = candidates[index];
}

export function findAllMoves(puzzle, allowed = ALL_TECHNIQUES) {
  const allowedSet = new Set(allowed);
  const candidates = candidateSets(puzzle);
  const moves = [];
  const add = (move) => {
    if (allowedSet.has(move.technique) && hasAction(move)) moves.push(move);
  };

  findLastDigits(puzzle, candidates).forEach(add);
  findNakedSingles(puzzle, candidates).forEach(add);
  findHiddenSingles(puzzle, candidates).forEach(add);
  findPointingCandidates(puzzle, candidates).forEach(add);
  findClaimingCandidates(puzzle, candidates).forEach(add);
  findNakedSubsets(puzzle, candidates, 2).forEach(add);
  findNakedSubsets(puzzle, candidates, 3).forEach(add);
  findNakedSubsets(puzzle, candidates, 4).forEach(add);
  findHiddenSubsets(puzzle, candidates, 2).forEach(add);
  findHiddenSubsets(puzzle, candidates, 3).forEach(add);
  findHiddenSubsets(puzzle, candidates, 4).forEach(add);
  findFish(puzzle, candidates, 2).forEach(add);
  findFish(puzzle, candidates, 3).forEach(add);
  findFish(puzzle, candidates, 4).forEach(add);
  findSkyscrapers(puzzle, candidates).forEach(add);
  findTwoStringKites(puzzle, candidates).forEach(add);
  findXYWings(puzzle, candidates).forEach(add);
  findXYZWings(puzzle, candidates).forEach(add);
  findWWings(puzzle, candidates).forEach(add);
  findCranes(puzzle, candidates).forEach(add);
  findSimpleColouring(puzzle, candidates).forEach(add);
  findEmptyRectangles(puzzle, candidates).forEach(add);

  return dedupeMoves(moves).sort((a, b) => {
    const order = ALL_TECHNIQUES.indexOf(a.technique) - ALL_TECHNIQUES.indexOf(b.technique);
    return order || a.cells[0] - b.cells[0] || a.technique.localeCompare(b.technique);
  });
}

export function applyMove(puzzle, move) {
  const before = clonePuzzle(puzzle);
  puzzle.history.push(before);
  for (const fill of move.fills || []) {
    puzzle.values[fill.index] = fill.digit;
    puzzle.notes[fill.index].clear();
    puzzle.eliminated[fill.index].clear();
  }
  for (const elim of move.eliminations || []) {
    puzzle.notes[elim.index].delete(elim.digit);
    puzzle.eliminated[elim.index].add(elim.digit);
  }
}

export function applySelectedTechniques(puzzle, allowed, limit = 200) {
  const applied = [];
  for (let i = 0; i < limit; i += 1) {
    const move = findAllMoves(puzzle, allowed)[0];
    if (!move) break;
    applyMove(puzzle, move);
    applied.push(move);
  }
  return applied;
}

export function isSolved(values) {
  return RANGE.every((index) => values[index]) && UNITS.every((unit) => {
    const seen = unit.cells.map((index) => values[index]).sort().join("");
    return seen === "123456789";
  });
}

function buildUnits() {
  const units = [];
  for (let row = 0; row < 9; row += 1) {
    units.push({ type: "row", index: row, cells: DIGITS.map((_, col) => row * 9 + col) });
  }
  for (let col = 0; col < 9; col += 1) {
    units.push({ type: "column", index: col, cells: DIGITS.map((_, row) => row * 9 + col) });
  }
  for (let box = 0; box < 9; box += 1) {
    const top = Math.floor(box / 3) * 3;
    const left = (box % 3) * 3;
    const cells = [];
    for (let row = top; row < top + 3; row += 1) {
      for (let col = left; col < left + 3; col += 1) cells.push(row * 9 + col);
    }
    units.push({ type: "block", index: box, cells });
  }
  return units;
}

function buildPeers() {
  return RANGE.map((index) => {
    const peers = new Set();
    for (const unit of UNITS.filter((unit) => unit.cells.includes(index))) {
      for (const cell of unit.cells) if (cell !== index) peers.add(cell);
    }
    return peers;
  });
}

function hasAction(move) {
  return (move.fills && move.fills.length) || (move.eliminations && move.eliminations.length);
}

function moveBase(technique, title, explanation, cells, evidence, eliminations = [], fills = []) {
  return {
    id: `${technique}-${title}-${cells.join("-")}-${eliminations.map((e) => `${e.index}.${e.digit}`).join("-")}-${fills.map((f) => `${f.index}.${f.digit}`).join("-")}`,
    technique,
    title,
    explanation,
    description: TECHNIQUE_DESCRIPTIONS[technique],
    cells: [...new Set(cells)],
    evidence: evidence || [],
    eliminations,
    fills
  };
}

function findLastDigits(puzzle) {
  const moves = [];
  for (const unit of UNITS) {
    const empties = unit.cells.filter((index) => !puzzle.values[index]);
    if (empties.length !== 1) continue;
    const used = new Set(unit.cells.map((index) => puzzle.values[index]).filter(Boolean));
    const missing = DIGITS.find((digit) => !used.has(digit));
    if (!missing || !legalCandidates(puzzle.values, empties[0]).has(missing)) continue;
    moves.push(moveBase(
      "Last Digit",
      `${missing} in ${cellName(empties[0])}`,
      `${sentenceUnitLabel(unit.type, unit.index)} has one empty cell. The only missing digit is ${missing}, so place it in ${readableCellName(empties[0])}.`,
      [empties[0]],
      unit.cells.map((index) => ({ index, digit: puzzle.values[index] || missing, role: "unit" })),
      [],
      [{ index: empties[0], digit: missing }]
    ));
  }
  return moves;
}

function findNakedSingles(puzzle, candidates) {
  return RANGE.flatMap((index) => {
    if (puzzle.values[index] || candidates[index].size !== 1) return [];
    const digit = [...candidates[index]][0];
    return [moveBase(
      "Naked Single",
      `${digit} in ${cellName(index)}`,
      `${sentenceCellName(index)} cannot contain any digit except ${digit}, so place ${digit} there.`,
      [index],
      [{ index, digit, role: "single" }],
      [],
      [{ index, digit }]
    )];
  });
}

function findHiddenSingles(puzzle, candidates) {
  const moves = [];
  for (const unit of UNITS) {
    for (const digit of DIGITS) {
      const places = unit.cells.filter((index) => !puzzle.values[index] && candidates[index].has(digit));
      if (places.length === 1) {
        const index = places[0];
        moves.push(moveBase(
          "Hidden Single",
          `${digit} in ${cellName(index)}`,
          `In ${getUnitLabel(unit.type, unit.index)}, ${digit} can go in only one cell: ${readableCellName(index)}. Place ${digit} there.`,
          [index],
          unit.cells.map((cell) => ({ index: cell, digit, role: cell === index ? "target" : "scan" })),
          [],
          [{ index, digit }]
        ));
      }
    }
  }
  return moves;
}

function findPointingCandidates(puzzle, candidates) {
  const moves = [];
  for (const box of UNITS.filter((unit) => unit.type === "block")) {
    for (const digit of DIGITS) {
      const cells = box.cells.filter((index) => !puzzle.values[index] && candidates[index].has(digit));
      if (cells.length < 2) continue;
      const sameRow = cells.every((index) => rowOf(index) === rowOf(cells[0]));
      const sameCol = cells.every((index) => colOf(index) === colOf(cells[0]));
      if (!sameRow && !sameCol) continue;
      const lineCells = sameRow ? unitBy("row", rowOf(cells[0])).cells : unitBy("column", colOf(cells[0])).cells;
      const eliminations = lineCells
        .filter((index) => boxOf(index) !== box.index && !puzzle.values[index] && candidates[index].has(digit))
        .map((index) => ({ index, digit }));
      if (!eliminations.length) continue;
      moves.push(moveBase(
        "Pointing Candidates",
        `${digit} points from block ${box.index + 1}`,
        `Inside block ${box.index + 1}, every possible ${digit} lies on the same ${sameRow ? "row" : "column"}. The block must place ${digit} there, so remove ${digit} from ${formatCellList(eliminations.map(({ index }) => index))} outside the block.`,
        [...cells, ...eliminations.map((elim) => elim.index)],
        cells.map((index) => ({ index, digit, role: "evidence" })),
        eliminations
      ));
    }
  }
  return moves;
}

function findClaimingCandidates(puzzle, candidates) {
  const moves = [];
  for (const line of UNITS.filter((unit) => unit.type !== "block")) {
    for (const digit of DIGITS) {
      const cells = line.cells.filter((index) => !puzzle.values[index] && candidates[index].has(digit));
      if (cells.length < 2 || !cells.every((index) => boxOf(index) === boxOf(cells[0]))) continue;
      const box = unitBy("block", boxOf(cells[0]));
      const eliminations = box.cells
        .filter((index) => !line.cells.includes(index) && !puzzle.values[index] && candidates[index].has(digit))
        .map((index) => ({ index, digit }));
      if (!eliminations.length) continue;
      moves.push(moveBase(
        "Claiming Candidates",
        `${digit} claimed by ${getUnitLabel(line.type, line.index)}`,
        `Every possible ${digit} on ${getUnitLabel(line.type, line.index)} lies inside block ${box.index + 1}. That ${line.type} must place ${digit} in the block, so remove ${digit} from ${formatCellList(eliminations.map(({ index }) => index))} elsewhere in the block.`,
        [...cells, ...eliminations.map((elim) => elim.index)],
        cells.map((index) => ({ index, digit, role: "evidence" })),
        eliminations
      ));
    }
  }
  return moves;
}

function findNakedSubsets(puzzle, candidates, size) {
  const names = { 2: "Naked Pair", 3: "Naked Triple", 4: "Naked Quadruple" };
  const moves = [];
  for (const unit of UNITS) {
    const useful = unit.cells.filter((index) => !puzzle.values[index] && candidates[index].size >= 2 && candidates[index].size <= size);
    for (const combo of combinations(useful, size)) {
      const union = unionSet(combo.map((index) => candidates[index]));
      if (union.size !== size) continue;
      const eliminations = unit.cells
        .filter((index) => !combo.includes(index) && !puzzle.values[index])
        .flatMap((index) => [...union].filter((digit) => candidates[index].has(digit)).map((digit) => ({ index, digit })));
      if (!eliminations.length) continue;
      moves.push(moveBase(
        names[size],
        `${[...union].join("")} in ${getUnitLabel(unit.type, unit.index)}`,
        `In ${getUnitLabel(unit.type, unit.index)}, ${formatCellList(combo)} can contain only ${formatDigitList([...union])}. Those digits must fill the chosen cells, so remove them from ${formatCellList(eliminations.map(({ index }) => index))}.`,
        [...combo, ...eliminations.map((elim) => elim.index)],
        combo.flatMap((index) => [...candidates[index]].map((digit) => ({ index, digit, role: "subset" }))),
        eliminations
      ));
    }
  }
  return moves;
}

function findHiddenSubsets(puzzle, candidates, size) {
  const names = { 2: "Hidden Pair", 3: "Hidden Triple", 4: "Hidden Quadruple" };
  const moves = [];
  for (const unit of UNITS) {
    const solvedDigits = new Set(unit.cells.map((index) => puzzle.values[index]).filter(Boolean));
    const openDigits = DIGITS.filter((digit) => !solvedDigits.has(digit));
    const digitPlaces = new Map(openDigits.map((digit) => [
      digit,
      unit.cells.filter((index) => !puzzle.values[index] && candidates[index].has(digit))
    ]));
    for (const digitCombo of combinations(openDigits, size)) {
      if (digitCombo.some((digit) => !digitPlaces.get(digit)?.length)) continue;
      const cells = [...new Set(digitCombo.flatMap((digit) => digitPlaces.get(digit)))];
      if (cells.length !== size || digitCombo.some((digit) => digitPlaces.get(digit).some((index) => !cells.includes(index)))) continue;
      const eliminations = cells.flatMap((index) => [...candidates[index]]
        .filter((digit) => !digitCombo.includes(digit))
        .map((digit) => ({ index, digit })));
      if (!eliminations.length) continue;
      moves.push(moveBase(
        names[size],
        `${formatDigitList(digitCombo)} hidden in ${getUnitLabel(unit.type, unit.index)}`,
        `${formatDigitList(digitCombo)} can appear only in ${formatCellList(cells)} within ${getUnitLabel(unit.type, unit.index)}. Those cells must contain the chosen digits, so remove their other candidates.`,
        cells,
        digitCombo.flatMap((digit) => cells
          .filter((index) => candidates[index].has(digit))
          .map((index) => ({ index, digit, role: "hidden" }))),
        eliminations
      ));
    }
  }
  return moves;
}

function findFish(puzzle, candidates, size) {
  const technique = { 2: "X-Wing", 3: "Swordfish", 4: "Jellyfish" }[size];
  const moves = [];
  for (const digit of DIGITS) {
    for (const orientation of ["row", "column"]) {
      const major = orientation === "row" ? "row" : "column";
      const minor = orientation === "row" ? "column" : "row";
      const lines = Array.from({ length: 9 }, (_, lineIndex) => {
        const cells = unitBy(major, lineIndex).cells.filter((index) => !puzzle.values[index] && candidates[index].has(digit));
        const minorPositions = [...new Set(cells.map((index) => orientation === "row" ? colOf(index) : rowOf(index)))];
        return { lineIndex, cells, minorPositions };
      }).filter((line) => line.minorPositions.length >= 2 && line.minorPositions.length <= size);
      for (const combo of combinations(lines, size)) {
        const minors = [...new Set(combo.flatMap((line) => line.minorPositions))];
        if (minors.length !== size) continue;
        const fishCells = combo.flatMap((line) => line.cells);
        const lineIndexes = combo.map((line) => line.lineIndex);
        const eliminations = minors.flatMap((minorIndex) => unitBy(minor, minorIndex).cells)
          .filter((index) => !fishCells.includes(index))
          .filter((index) => !puzzle.values[index] && candidates[index].has(digit))
          .filter((index) => !lineIndexes.includes(orientation === "row" ? rowOf(index) : colOf(index)))
          .map((index) => ({ index, digit }));
        if (!eliminations.length) continue;
        moves.push(moveBase(
          technique,
          `${digit} ${technique.toLowerCase()}`,
          `Candidate ${digit} can go in ${formatTextList(combo.map((line) => getUnitLabel(major, line.lineIndex)))} only where they cross ${formatTextList(minors.map((index) => getUnitLabel(minor, index)))}. Each chosen ${major} must place ${digit} in those crossings, so remove ${digit} from ${formatCellList(eliminations.map(({ index }) => index))}.`,
          [...fishCells, ...eliminations.map((elim) => elim.index)],
          fishCells.map((index) => ({ index, digit, role: "fish" })),
          eliminations
        ));
      }
    }
  }
  return moves;
}

function findSkyscrapers(puzzle, candidates) {
  const moves = [];
  for (const digit of DIGITS) {
    for (const orientation of ["row", "column"]) {
      const lines = Array.from({ length: 9 }, (_, i) => unitBy(orientation, i).cells
        .filter((index) => !puzzle.values[index] && candidates[index].has(digit)))
        .map((cells, index) => ({ index, cells }))
        .filter((line) => line.cells.length === 2);
      for (const [a, b] of combinations(lines, 2)) {
        const positionsA = a.cells.map((index) => orientation === "row" ? colOf(index) : rowOf(index));
        const positionsB = b.cells.map((index) => orientation === "row" ? colOf(index) : rowOf(index));
        const shared = positionsA.filter((pos) => positionsB.includes(pos));
        if (shared.length !== 1) continue;
        const farA = a.cells.find((index) => (orientation === "row" ? colOf(index) : rowOf(index)) !== shared[0]);
        const farB = b.cells.find((index) => (orientation === "row" ? colOf(index) : rowOf(index)) !== shared[0]);
        const eliminations = commonPeers(farA, farB)
          .filter((index) => !puzzle.values[index] && candidates[index].has(digit))
          .map((index) => ({ index, digit }));
        if (!eliminations.length) continue;
        moves.push(moveBase(
          "Skyscraper",
          `${digit} skyscraper`,
          `${sentenceUnitLabel(orientation, a.index)} and ${getUnitLabel(orientation, b.index)} each have exactly two possible cells for ${digit}, with one cell from each pair lined up. If the first lined-up cell is not ${digit}, ${readableCellName(farA)} must be; if it is, ${readableCellName(farB)} must be. Remove ${digit} from ${formatCellList(eliminations.map(({ index }) => index))}. Each listed cell shares a row, column, or block with both unaligned cells.`,
          [...a.cells, ...b.cells, ...eliminations.map((elim) => elim.index)],
          [...a.cells, ...b.cells].map((index) => ({ index, digit, role: "link" })),
          eliminations
        ));
      }
    }
  }
  return moves;
}

function findTwoStringKites(puzzle, candidates) {
  const moves = [];
  for (const digit of DIGITS) {
    const rowLinks = conjugateLinks(candidates, digit, "row");
    const colLinks = conjugateLinks(candidates, digit, "column");
    for (const rowLink of rowLinks) {
      for (const colLink of colLinks) {
        const sharedBoxPairs = rowLink.cells.flatMap((rCell) => colLink.cells.map((cCell) => [rCell, cCell]))
          .filter(([rCell, cCell]) => rCell !== cCell && boxOf(rCell) === boxOf(cCell));
        if (sharedBoxPairs.length !== 1) continue;
        const [rowNear, colNear] = sharedBoxPairs[0];
        const rowFar = rowLink.cells.find((cell) => cell !== rowNear);
        const colFar = colLink.cells.find((cell) => cell !== colNear);
        if (rowFar === colFar) continue;
        const target = rowOf(colFar) * 9 + colOf(rowFar);
        if (target === rowFar || target === colFar || puzzle.values[target] || !candidates[target].has(digit)) continue;
        moves.push(moveBase(
          "2-String Kite",
          `${digit} kite`,
          `${sentenceUnitLabel(rowLink.unit.type, rowLink.unit.index)} and ${getUnitLabel(colLink.unit.type, colLink.unit.index)} each have exactly two possible cells for ${digit}. One cell from each pair lies in block ${boxOf(rowNear) + 1}, so at least one outside cell must be ${digit}. Remove ${digit} from ${readableCellName(target)}. That cell shares a row, column, or block with both outside cells.`,
          [...rowLink.cells, ...colLink.cells, target],
          [...rowLink.cells, ...colLink.cells].map((index) => ({ index, digit, role: "link" })),
          [{ index: target, digit }]
        ));
      }
    }
  }
  return moves;
}

function findCranes(puzzle, candidates) {
  const moves = [];
  for (const digit of DIGITS) {
    const boxLinks = conjugateLinks(candidates, digit, "block");
    const lineLinks = [
      ...conjugateLinks(candidates, digit, "row"),
      ...conjugateLinks(candidates, digit, "column")
    ];
    for (const boxLink of boxLinks) {
      for (const lineLink of lineLinks) {
        for (const boxNear of boxLink.cells) {
          for (const lineNear of lineLink.cells) {
            if (boxNear === lineNear || !PEERS[boxNear].has(lineNear)) continue;
            const boxFar = boxLink.cells.find((cell) => cell !== boxNear);
            const lineFar = lineLink.cells.find((cell) => cell !== lineNear);
            if (boxFar === lineFar || PEERS[boxFar].has(lineFar)) continue;
            const eliminations = commonPeers(boxFar, lineFar)
              .filter((index) => !puzzle.values[index] && candidates[index].has(digit))
              .filter((index) => !boxLink.cells.includes(index) && !lineLink.cells.includes(index))
              .map((index) => ({ index, digit }));
            if (!eliminations.length) continue;
            moves.push(moveBase(
              "Crane",
              `${digit} crane`,
              `A two-place link for ${digit} in block ${boxOf(boxNear) + 1} connects to a two-place line link. One far end must be ${digit}, so cells seeing both far ends cannot be ${digit}.`,
              [...boxLink.cells, ...lineLink.cells, ...eliminations.map((elim) => elim.index)],
              [...boxLink.cells, ...lineLink.cells].map((index) => ({ index, digit, role: "link" })),
              eliminations
            ));
          }
        }
      }
    }
  }
  return moves;
}

function findSimpleColouring(puzzle, candidates) {
  const moves = [];
  for (const digit of DIGITS) {
    const links = ["row", "column", "block"].flatMap((type) => conjugateLinks(candidates, digit, type));
    const graph = new Map();
    for (const { cells: [a, b] } of links) {
      if (!graph.has(a)) graph.set(a, new Set());
      if (!graph.has(b)) graph.set(b, new Set());
      graph.get(a).add(b);
      graph.get(b).add(a);
    }
    const visited = new Set();
    for (const start of graph.keys()) {
      if (visited.has(start)) continue;
      const colours = new Map([[start, 0]]);
      const queue = [start];
      visited.add(start);
      while (queue.length) {
        const cell = queue.shift();
        for (const next of graph.get(cell) || []) {
          if (!colours.has(next)) {
            colours.set(next, 1 - colours.get(cell));
            visited.add(next);
            queue.push(next);
          }
        }
      }
      if (colours.size < 3) continue;
      const colourCells = [0, 1].map((colour) => [...colours].filter(([, value]) => value === colour).map(([cell]) => cell));
      const chainCells = [...colours.keys()];
      const eliminations = RANGE
        .filter((index) => !puzzle.values[index] && candidates[index].has(digit) && !colours.has(index))
        .filter((index) => colourCells.every((cells) => cells.some((cell) => PEERS[index].has(cell))))
        .map((index) => ({ index, digit }));
      if (!eliminations.length) continue;
      moves.push(moveBase(
        "Simple Colouring",
        `${digit} colouring chain`,
        `The linked two-place candidates for ${digit} alternate between two colours. A candidate that sees both colours cannot be ${digit}.`,
        [...chainCells, ...eliminations.map((elim) => elim.index)],
        chainCells.map((index) => ({ index, digit, role: `colour-${colours.get(index) + 1}` })),
        eliminations
      ));
    }
  }
  return moves;
}

function findEmptyRectangles(puzzle, candidates) {
  const moves = [];
  for (const digit of DIGITS) {
    for (let box = 0; box < 9; box += 1) {
      const boxCells = unitBy("block", box).cells.filter((index) => !puzzle.values[index] && candidates[index].has(digit));
      if (boxCells.length < 2) continue;
      const rows = [...new Set(boxCells.map(rowOf))];
      const cols = [...new Set(boxCells.map(colOf))];
      for (const row of rows) {
        for (const col of cols) {
          if (!boxCells.every((index) => rowOf(index) === row || colOf(index) === col)) continue;
          const rowArm = boxCells.filter((index) => rowOf(index) === row && colOf(index) !== col);
          const colArm = boxCells.filter((index) => colOf(index) === col && rowOf(index) !== row);
          if (!rowArm.length || !colArm.length) continue;
          for (const link of conjugateLinks(candidates, digit, "column")) {
            for (const near of link.cells.filter((index) => rowOf(index) === row && boxOf(index) !== box)) {
              const far = link.cells.find((index) => index !== near);
              addEmptyRectangleMove(moves, puzzle, candidates, digit, boxCells, link.cells, far, rowOf(far) * 9 + col);
            }
          }
          for (const link of conjugateLinks(candidates, digit, "row")) {
            for (const near of link.cells.filter((index) => colOf(index) === col && boxOf(index) !== box)) {
              const far = link.cells.find((index) => index !== near);
              addEmptyRectangleMove(moves, puzzle, candidates, digit, boxCells, link.cells, far, row * 9 + colOf(far));
            }
          }
        }
      }
    }
  }
  return moves;
}

function addEmptyRectangleMove(moves, puzzle, candidates, digit, boxCells, linkCells, far, target) {
  if (target === far || boxCells.includes(target) || linkCells.includes(target) || puzzle.values[target] || !candidates[target].has(digit)) return;
  moves.push(moveBase(
    "Empty Rectangle",
    `${digit} empty rectangle`,
    `The ${digit} candidates in block ${boxOf(boxCells[0]) + 1} lie on one row and one column. Together with an outside two-place link, they remove ${digit} from ${cellName(target)}.`,
    [...boxCells, ...linkCells, target],
    [...boxCells, ...linkCells].map((index) => ({ index, digit, role: "link" })),
    [{ index: target, digit }]
  ));
}

function findXYWings(puzzle, candidates) {
  const bivalueCells = RANGE.filter((index) => !puzzle.values[index] && candidates[index].size === 2);
  const moves = [];
  for (const pivot of bivalueCells) {
    const [x, y] = [...candidates[pivot]];
    const peers = bivalueCells.filter((cell) => PEERS[pivot].has(cell));
    const xzWings = peers.filter((cell) => candidates[cell].has(x) && !candidates[cell].has(y));
    const yzWings = peers.filter((cell) => candidates[cell].has(y) && !candidates[cell].has(x));
    for (const wingA of xzWings) {
      const z = [...candidates[wingA]].find((digit) => digit !== x);
      for (const wingB of yzWings.filter((cell) => candidates[cell].has(z))) {
        const eliminations = commonPeers(wingA, wingB)
          .filter((index) => !puzzle.values[index] && index !== pivot && candidates[index].has(z))
          .map((index) => ({ index, digit: z }));
        if (!eliminations.length) continue;
        moves.push(moveBase(
          "XY-Wing",
          `${x}${y}${z} wing`,
          `The center cell at ${readableCellName(pivot)} is either ${x} or ${y}. If it is ${x}, ${readableCellName(wingB)} must be ${z}; if it is ${y}, ${readableCellName(wingA)} must be ${z}. One outer cell must therefore be ${z}, so remove ${z} from ${formatCellList(eliminations.map(({ index }) => index))}. Each listed cell shares a row, column, or block with both outer cells.`,
          [pivot, wingA, wingB, ...eliminations.map((elim) => elim.index)],
          [
            ...[x, y].map((digit) => ({ index: pivot, digit, role: "pivot" })),
            ...[...candidates[wingA]].map((digit) => ({ index: wingA, digit, role: "wing" })),
            ...[...candidates[wingB]].map((digit) => ({ index: wingB, digit, role: "wing" }))
          ],
          eliminations
        ));
      }
    }
  }
  return moves;
}

function findXYZWings(puzzle, candidates) {
  const pivots = RANGE.filter((index) => !puzzle.values[index] && candidates[index].size === 3);
  const bivalueCells = RANGE.filter((index) => !puzzle.values[index] && candidates[index].size === 2);
  const moves = [];
  for (const pivot of pivots) {
    const digits = [...candidates[pivot]];
    const wings = bivalueCells.filter((cell) => PEERS[pivot].has(cell) && isSubset(candidates[cell], candidates[pivot]));
    for (const [wingA, wingB] of combinations(wings, 2)) {
      const shared = [...candidates[wingA]].filter((digit) => candidates[wingB].has(digit));
      if (shared.length !== 1) continue;
      const z = shared[0];
      if (!digits.includes(z)) continue;
      const covered = unionSet([candidates[wingA], candidates[wingB]]);
      if (covered.size !== 3) continue;
      const eliminations = commonPeers(pivot, wingA, wingB)
        .filter((index) => !puzzle.values[index] && ![pivot, wingA, wingB].includes(index) && candidates[index].has(z))
        .map((index) => ({ index, digit: z }));
      if (!eliminations.length) continue;
      moves.push(moveBase(
        "XYZ-Wing",
        `${digits.join("")} xyz-wing`,
        `The center cell at ${readableCellName(pivot)} contains ${formatDigitList(digits)}. If it is ${z}, the center supplies ${z}; if it takes either other digit, one outer cell must be ${z}. Remove ${z} from ${formatCellList(eliminations.map(({ index }) => index))}. Each listed cell shares a row, column, or block with the center and both outer cells.`,
        [pivot, wingA, wingB, ...eliminations.map((elim) => elim.index)],
        [pivot, wingA, wingB].flatMap((index) => [...candidates[index]].map((digit) => ({ index, digit, role: "wing" }))),
        eliminations
      ));
    }
  }
  return moves;
}

function findWWings(puzzle, candidates) {
  const moves = [];
  const bivalueCells = RANGE.filter((index) => !puzzle.values[index] && candidates[index].size === 2);
  for (const [a, b] of combinations(bivalueCells, 2)) {
    if (sameSet(candidates[a], candidates[b]) && !PEERS[a].has(b)) {
      const [x, y] = [...candidates[a]];
      for (const linkDigit of [x, y]) {
        const otherDigit = linkDigit === x ? y : x;
        const links = conjugateLinks(candidates, linkDigit, "row").concat(conjugateLinks(candidates, linkDigit, "column"), conjugateLinks(candidates, linkDigit, "block"));
        const connecting = links.find((link) => {
          const [first, second] = link.cells;
          return (PEERS[a].has(first) && PEERS[b].has(second)) || (PEERS[a].has(second) && PEERS[b].has(first));
        });
        if (!connecting) continue;
        const eliminations = commonPeers(a, b)
          .filter((index) => !puzzle.values[index] && candidates[index].has(otherDigit))
          .map((index) => ({ index, digit: otherDigit }));
        if (!eliminations.length) continue;
        moves.push(moveBase(
          "W-Wing",
          `${x}${y} w-wing`,
          `${sentenceCellName(a)} and ${readableCellName(b)} both contain ${x} and ${y}. In ${getUnitLabel(connecting.unit.type, connecting.unit.index)}, ${linkDigit} has exactly two possible cells, with one connected to each matching cell. One matching cell must therefore be ${otherDigit}. Remove ${otherDigit} from ${formatCellList(eliminations.map(({ index }) => index))}. Each listed cell shares a row, column, or block with both matching cells.`,
          [a, b, ...connecting.cells, ...eliminations.map((elim) => elim.index)],
          [a, b, ...connecting.cells].flatMap((index) => [...candidates[index]].map((digit) => ({ index, digit, role: "link" }))),
          eliminations
        ));
      }
    }
  }
  return moves;
}

function conjugateLinks(candidates, digit, type) {
  return UNITS.filter((unit) => unit.type === type)
    .map((unit) => ({
      unit,
      cells: unit.cells.filter((index) => candidates[index].has(digit))
    }))
    .filter((link) => link.cells.length === 2);
}

function unitBy(type, index) {
  return UNITS.find((unit) => unit.type === type && unit.index === index);
}

function commonPeers(...cells) {
  if (!cells.length) return [];
  let result = new Set(PEERS[cells[0]]);
  for (const cell of cells.slice(1)) {
    result = new Set([...result].filter((index) => PEERS[cell].has(index)));
  }
  return [...result];
}

function combinations(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...tail] = items;
  return combinations(tail, size - 1).map((combo) => [head, ...combo]).concat(combinations(tail, size));
}

function unionSet(sets) {
  const result = new Set();
  for (const set of sets) for (const value of set) result.add(value);
  return result;
}

function isSubset(a, b) {
  return [...a].every((value) => b.has(value));
}

function sameSet(a, b) {
  return a.size === b.size && isSubset(a, b);
}

function formatDigitList(digits) {
  if (digits.length <= 1) return String(digits[0] ?? "");
  if (digits.length === 2) return `${digits[0]} and ${digits[1]}`;
  return `${digits.slice(0, -1).join(", ")}, and ${digits[digits.length - 1]}`;
}

function readableCellName(index) {
  return `row ${rowOf(index) + 1}, column ${colOf(index) + 1}`;
}

function sentenceCellName(index) {
  const label = readableCellName(index);
  return `${label[0].toUpperCase()}${label.slice(1)}`;
}

function formatCellList(cells) {
  return formatTextList([...new Set(cells)].map(readableCellName));
}

function formatTextList(items) {
  const labels = [...new Set(items)];
  if (labels.length <= 1) return labels[0] || "the highlighted cell";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function sentenceUnitLabel(type, index) {
  const label = getUnitLabel(type, index);
  return `${label[0].toUpperCase()}${label.slice(1)}`;
}

function dedupeMoves(moves) {
  const seen = new Set();
  return moves.filter((move) => {
    const action = [
      move.technique,
      ...move.fills.map((fill) => `f${fill.index}-${fill.digit}`),
      ...move.eliminations.map((elim) => `e${elim.index}-${elim.digit}`)
    ].join("|");
    if (seen.has(action)) return false;
    seen.add(action);
    return true;
  });
}

function normalizeCandidateState(candidateState) {
  if (!Array.isArray(candidateState) || candidateState.length !== 81) {
    return Array.from({ length: 81 }, () => new Set());
  }
  return candidateState.map((digits) => new Set(digits || []));
}
