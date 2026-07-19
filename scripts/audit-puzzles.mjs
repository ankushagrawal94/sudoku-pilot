import { getSudoku } from "sudoku-gen";
import { DIFFICULTY_ORDER, ratePuzzle } from "../src/difficulty.js";
import { CERTIFIED_PUZZLES, CATALOG_BY_DIFFICULTY, transformCatalogPuzzle } from "../src/puzzleCatalog.js";

const sampleSize = Number(process.argv[2]) || 100;
const report = {};

for (const source of DIFFICULTY_ORDER) {
  const ratings = Object.fromEntries([...DIFFICULTY_ORDER, "unsupported", "invalid"].map((level) => [level, 0]));
  const techniques = {};
  for (let index = 0; index < sampleSize; index += 1) {
    const generated = source === "extreme" ? transformCatalogPuzzle(CATALOG_BY_DIFFICULTY.extreme[index % CATALOG_BY_DIFFICULTY.extreme.length]) : getSudoku(source);
    const rating = ratePuzzle(generated.grid || generated.puzzle);
    ratings[rating.level || rating.status] = (ratings[rating.level || rating.status] || 0) + 1;
    if (rating.hardestTechnique) techniques[rating.hardestTechnique] = (techniques[rating.hardestTechnique] || 0) + 1;
  }
  report[source] = { sampleSize, ratings, hardestTechniques: techniques };
}

report.certifiedCatalog = CERTIFIED_PUZZLES.map((puzzle) => {
  const rating = ratePuzzle(puzzle.grid);
  return {
    id: puzzle.id,
    declaredDifficulty: puzzle.difficulty,
    ratedDifficulty: rating.level,
    hardestTechnique: rating.hardestTechnique,
    steps: rating.steps,
    solutionCount: rating.solutionCount,
    source: puzzle.source || "local"
  };
});

console.log(JSON.stringify(report, null, 2));
