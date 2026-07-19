import { createHash } from "node:crypto";

const GROUP_PERMUTATIONS = permutations([0, 1, 2]);
const LINE_PERMUTATIONS = GROUP_PERMUTATIONS.flatMap((groups) => (
  cartesian(GROUP_PERMUTATIONS, GROUP_PERMUTATIONS, GROUP_PERMUTATIONS).map((within) => (
    groups.flatMap((group) => within[group].map((offset) => group * 3 + offset))
  ))
));

/**
 * Return the exact minimum representative under Sudoku's standard logical
 * equivalences: digit relabeling, row/band permutations, column/stack
 * permutations, and transposition (which also covers rotations/reflections
 * when combined with the row/column operations).
 */
export function canonicalizePuzzle(grid) {
  const cells = parseGrid(grid);
  let best = null;

  for (let transposed = 0; transposed < 2; transposed += 1) {
    for (const rows of LINE_PERMUTATIONS) {
      for (const columns of LINE_PERMUTATIONS) {
        const digitMap = new Uint8Array(10);
        let nextDigit = 1;
        const candidate = new Uint8Array(81);
        let relation = 0;
        let write = 0;

        for (let row = 0; row < 9; row += 1) {
          for (let column = 0; column < 9; column += 1) {
            const sourceRow = transposed ? columns[column] : rows[row];
            const sourceColumn = transposed ? rows[row] : columns[column];
            const value = cells[sourceRow * 9 + sourceColumn];
            if (value && !digitMap[value]) digitMap[value] = nextDigit++;
            const normalized = value ? digitMap[value] : 0;
            candidate[write] = normalized;
            if (best && relation === 0 && normalized !== best[write]) {
              relation = normalized < best[write] ? -1 : 1;
            }
            write += 1;
            if (relation > 0) break;
          }
          if (relation > 0) break;
        }

        if (!best || relation < 0) best = candidate;
      }
    }
  }

  return [...best].join("");
}

export function canonicalPuzzleId(grid) {
  const canonicalGrid = canonicalizePuzzle(grid);
  return {
    canonicalGrid,
    canonicalId: `c1-${createHash("sha256").update(canonicalGrid).digest("hex")}`
  };
}

function parseGrid(grid) {
  const cells = [...String(grid)].map((cell) => /[1-9]/.test(cell) ? Number(cell) : 0);
  if (cells.length !== 81) throw new Error(`A canonical puzzle grid must contain exactly 81 cells; received ${cells.length}.`);
  return cells;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => (
    permutations(values.filter((_, candidate) => candidate !== index)).map((rest) => [value, ...rest])
  ));
}

function cartesian(...sets) {
  return sets.reduce((products, set) => products.flatMap((product) => set.map((value) => [...product, value])), [[]]);
}
