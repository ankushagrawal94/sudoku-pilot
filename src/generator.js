import { DIFFICULTY_ORDER } from "./difficulty.js";
import { ALL_TECHNIQUES, TECHNIQUE_LEVELS } from "./puzzles.js";
import { selectCatalogPuzzle, transformCatalogPuzzle } from "./puzzleCatalog.js";

export function generatePuzzle({
  difficulty = "medium",
  requiredTechniques = [],
  excludedTechniques = [],
  playedCanonicalIds = [],
  random = Math.random
} = {}) {
  if (!DIFFICULTY_ORDER.includes(difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  const required = normalizeTechniques(requiredTechniques, "requiredTechniques");
  const excluded = normalizeTechniques(excludedTechniques, "excludedTechniques");
  const profile = new Set(TECHNIQUE_LEVELS[difficulty]);
  for (const technique of required) {
    if (!profile.has(technique)) throw new Error(`${technique} is not available at ${difficulty} difficulty.`);
    if (excluded.has(technique)) throw new Error(`${technique} cannot be both required and excluded.`);
  }
  const source = selectCatalogPuzzle({ difficulty, requiredTechniques: required, excludedTechniques: excluded, playedCanonicalIds, random });
  if (!source) throw unavailableError(difficulty, required, excluded);
  const transformed = transformCatalogPuzzle(source, random);
  return {
    grid: transformed.grid,
    solution: transformed.solution,
    sourceId: source.id,
    canonicalId: source.id,
    rating: {
      status: "solved",
      level: source.level,
      steps: source.steps,
      techniqueCounts: Object.fromEntries(source.techniques.map((technique) => [technique, 1]))
    },
    requiredTechniques: source.required
  };
}

function normalizeTechniques(value, field) {
  if (value == null) return new Set();
  if (typeof value === "string" || typeof value[Symbol.iterator] !== "function") throw new TypeError(`${field} must be an array, Set, or other iterable collection.`);
  const techniques = new Set(value);
  for (const technique of techniques) if (!ALL_TECHNIQUES.includes(technique)) throw new Error(`Unknown technique in ${field}: ${technique}`);
  return techniques;
}

function unavailableError(difficulty, required, excluded) {
  const criteria = [
    required.size ? `requiring ${[...required].join(", ")}` : "",
    excluded.size ? `excluding ${[...excluded].join(", ")}` : ""
  ].filter(Boolean).join(" and ");
  return new Error(`No certified ${difficulty} puzzle is currently available${criteria ? ` ${criteria}` : ""}.`);
}
