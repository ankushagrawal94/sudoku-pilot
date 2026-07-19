import easy from "./catalog/easy.json" with { type: "json" };
import medium from "./catalog/medium.json" with { type: "json" };
import hard from "./catalog/hard.json" with { type: "json" };
import expert from "./catalog/expert.json" with { type: "json" };
import extreme from "./catalog/extreme.json" with { type: "json" };

export const CATALOG_BY_DIFFICULTY = { easy, medium, hard, expert, extreme };
export const CERTIFIED_PUZZLES = Object.values(CATALOG_BY_DIFFICULTY).flat();

export function selectCatalogPuzzle({
  difficulty,
  requiredTechniques = [],
  excludedTechniques = [],
  playedCanonicalIds = [],
  random = Math.random
}) {
  const required = new Set(requiredTechniques);
  const excluded = new Set(excludedTechniques);
  const played = new Set(playedCanonicalIds);
  const eligible = (CATALOG_BY_DIFFICULTY[difficulty] || []).filter((puzzle) => (
    [...required].every((technique) => puzzle.required.includes(technique)) &&
    [...excluded].every((technique) => !puzzle.techniques.includes(technique))
  ));
  if (!eligible.length) return null;
  const unseen = eligible.filter((puzzle) => !played.has(puzzle.id));
  const pool = unseen.length ? unseen : eligible;
  return pool[Math.floor(random() * pool.length)];
}

export function transformCatalogPuzzle(source, random = Math.random) {
  const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const rowOrder = groupedOrder(random);
  const colOrder = groupedOrder(random);
  const transpose = random() < 0.5;
  const transform = (sequence) => {
    const result = [];
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        const sourceRow = transpose ? rowOrder[col] : rowOrder[row];
        const sourceCol = transpose ? colOrder[row] : colOrder[col];
        const value = Number(sequence[sourceRow * 9 + sourceCol]) || 0;
        result.push(value ? digits[value - 1] : 0);
      }
    }
    return result.join("");
  };
  return { ...source, grid: transform(source.grid), solution: transform(source.solution) };
}

function groupedOrder(random) {
  return shuffled([0, 1, 2], random).flatMap((group) => shuffled([0, 1, 2], random).map((offset) => group * 3 + offset));
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
