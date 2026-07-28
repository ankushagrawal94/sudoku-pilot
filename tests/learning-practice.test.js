import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { countSolutions } from "../src/difficulty.js";
import { LEARNER_GLOSSARY, TECHNIQUE_LESSONS, validateLessonCatalog } from "../src/learning.js";
import {
  buildCertifiedPracticeFixturesForGeneration,
  compactPracticeFixtures,
  createPracticeState,
  getCertifiedPracticeFixtures,
  getPrecomputedPracticeFixtureSources,
  PRACTICE_MODES,
  validatePracticeFixture
} from "../src/practice.js";
import { COMMITTED_COACHING_TECHNIQUES, PROVISIONAL_TECHNIQUES } from "../src/puzzles.js";
import { applyMove, candidateSets, clonePuzzle, findAllMoves, isSolved } from "../src/solver.js";

assert.ok(validateLessonCatalog());
assert.deepEqual(Object.keys(TECHNIQUE_LESSONS), COMMITTED_COACHING_TECHNIQUES, "lesson catalog must exactly match committed Tier 1 and Tier 2");
for (const technique of PROVISIONAL_TECHNIQUES) assert.equal(TECHNIQUE_LESSONS[technique], undefined, `${technique} must not be promoted by the lesson catalog`);

const measurements = [];
const learnerJargon = /\b(unit|peer|bivalue|trivalue|visibility|base lines?|cover lines?|candidate union|position union|subset|preconditions?|evidence|provisional|deterministic|certified|solution-safe|committed-technique|endpoint)\b/i;
for (const technique of COMMITTED_COACHING_TECHNIQUES) {
  const lesson = TECHNIQUE_LESSONS[technique];
  assert.ok(lesson.whatItIs.definition);
  assert.ok(lesson.whatItIs.outcome);
  assert.ok(lesson.whatItIs.prerequisites);
  assert.ok(Array.isArray(lesson.whatItIs.terms));
  for (const term of lesson.whatItIs.terms) assert.ok(Object.values(LEARNER_GLOSSARY).includes(term), `${technique} glossary entries must come from the shared learner glossary`);
  assert.ok(lesson.howToRecognize.introduction);
  assert.ok(lesson.howToRecognize.steps.length >= 3);
  assert.ok(lesson.howToRecognize.conditions.length >= 2);
  assert.ok(lesson.whyItWorks.plain, `${technique} plain-language explanation is shown by default`);
  assert.ok(lesson.whyItWorks.formal);
  assert.deepEqual(lesson.workedExample.progression, ["technique", "search focus", "structural location", "exact explained move"]);
  assert.ok(lesson.commonMistakes.nearMiss);
  assert.ok(lesson.commonMistakes.items.length >= 2);
  assert.equal(lesson.tryIt.mode, "find-pattern");
  const defaultLearnerCopy = [
    lesson.whatItIs.definition,
    lesson.whatItIs.prerequisites,
    lesson.howToRecognize.introduction,
    ...lesson.howToRecognize.steps,
    ...lesson.howToRecognize.conditions,
    lesson.whyItWorks.plain,
    lesson.commonMistakes.nearMiss,
    ...lesson.commonMistakes.items
  ];
  for (const copy of defaultLearnerCopy) assert.doesNotMatch(copy, learnerJargon, `${technique} default copy must explain the idea without solver jargon`);
  assert.ok(wordCount(lesson.howToRecognize.introduction) <= 30, `${technique} recognition introduction should stay scannable`);
  for (const step of lesson.howToRecognize.steps) assert.ok(wordCount(step) <= 24, `${technique} recognition steps should stay scannable`);
  assert.ok(wordCount(lesson.whyItWorks.plain) <= 45, `${technique} plain explanation should stay concise`);

  const started = performance.now();
  const fixtures = getCertifiedPracticeFixtures(technique);
  const fixtureLoadMs = performance.now() - started;
  const generatedFixtures = buildCertifiedPracticeFixturesForGeneration(technique);
  assert.deepEqual(
    getPrecomputedPracticeFixtureSources(technique),
    compactPracticeFixtures(generatedFixtures),
    `${technique} precomputed fixtures must exactly match exhaustive deterministic generation`
  );
  assert.equal(fixtures.length, 10, `${technique} needs 10 deterministic certified practice fixtures`);
  assert.equal(fixtures.filter(({ nearMiss }) => nearMiss.valid).length, 5, `${technique} needs valid recognition cases`);
  assert.equal(fixtures.filter(({ nearMiss }) => !nearMiss.valid).length, 5, `${technique} needs invalid recognition cases`);

  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    const generatedFixture = generatedFixtures[fixtureIndex];
    assert.ok(validatePracticeFixture(generatedFixture));
    assert.equal(countSolutions(fixture.puzzle.values, 2), 1, `${fixture.id} must remain uniquely solvable`);
    assert.equal(findAllMoves(fixture.puzzle, [technique]).length, 1, `${fixture.id} must offer exactly one ${technique} action`);
    if (["Last Digit", "Naked Single", "Hidden Single"].includes(technique)) {
      const singleEffects = new Set(findAllMoves(fixture.puzzle, ["Last Digit", "Naked Single", "Hidden Single"]).map(effectKey));
      assert.equal(singleEffects.size, 1, `${fixture.id} must focus every single clue on the same placement`);
    } else {
      assert.equal(
        findAllMoves(fixture.puzzle, ["Last Digit", "Naked Single", "Hidden Single"]).length,
        0,
        `${fixture.id} must not distract from ${technique} with available singles`
      );
    }
    const logicalCandidates = candidateSets(fixture.puzzle);
    for (const evidence of fixture.targetMove.evidence) {
      if (!evidence.digit || fixture.puzzle.values[evidence.index] || ["scan", "unit"].includes(evidence.role)) continue;
      assert.ok(logicalCandidates[evidence.index].has(evidence.digit), `${fixture.id} evidence candidate must exist logically`);
    }
    for (const fill of fixture.targetMove.fills) assert.equal(fill.digit, fixture.puzzle.solution[fill.index], `${fixture.id} fill must match the solution`);
    for (const elimination of fixture.targetMove.eliminations) assert.notEqual(elimination.digit, fixture.puzzle.solution[elimination.index], `${fixture.id} elimination must preserve the solution`);
    assertCompletionTrace(generatedFixture);
    assert.match(fixture.nearMiss.explanation, fixture.nearMiss.valid ? /^Yes\./ : /^No\./);
    assert.doesNotMatch(fixture.nearMiss.explanation, /Every defining precondition is present/i, `${fixture.id} recognition feedback must name the checks instead of declaring success abstractly`);
    if (!fixture.nearMiss.valid) assert.doesNotMatch(fixture.nearMiss.explanation, /does not keep the required pattern positions/i, `${fixture.id} invalid feedback must name the broken rule`);
    for (const stage of fixture.coaching.stages) assert.doesNotMatch(stage.message, learnerJargon, `${fixture.id} coaching stage ${stage.number} must use learner-facing language`);
    assert.doesNotMatch(fixture.coaching.exactExplanation, /\br\d+c\d+\b/i, `${fixture.id} exact explanation must spell out row and column coordinates`);
    if (fixture.targetMove.fills.length) assert.equal(fixture.coaching.stages[1].revealedDigits[0], fixture.targetMove.fills[0].digit, `${fixture.id} placement clue must focus on the digit actually placed`);
  }

  for (const mode of PRACTICE_MODES) {
    const attemptsStarted = performance.now();
    let successes = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = createPracticeState(technique, mode.id, attempt);
      if (state.technique === technique && state.mode === mode.id && state.certification.targetAvailable) successes += 1;
    }
    const elapsedMs = performance.now() - attemptsStarted;
    assert.ok(successes >= 99, `${technique} ${mode.label} must start at least 99 of 100 attempts`);
    measurements.push({ technique, mode: mode.id, successes, attempts: 100, fixtureLoadMs, hundredStartsMs: elapsedMs });
  }
}

for (const mode of PRACTICE_MODES) assert.doesNotMatch(mode.description, learnerJargon, `${mode.label} description must avoid internal certification language`);

for (const technique of ["Hidden Pair", "Hidden Triple"]) {
  const lesson = TECHNIQUE_LESSONS[technique];
  assert.match(lesson.howToRecognize.introduction, /tracking digits/i, `${technique} should teach the perspective shift from cells to digits`);
  assert.ok(lesson.howToRecognize.steps.some((step) => /for each digit separately/i.test(step)), `${technique} should map each digit's positions separately`);
  assert.ok(lesson.howToRecognize.conditions.some((condition) => /combined positions occupy exactly/i.test(condition)), `${technique} should state the combined-position rule`);
  assert.match(lesson.whyItWorks.plain, /different homes/i, `${technique} should explain why the cells are reserved`);
  assert.ok(lesson.commonMistakes.items.some((item) => /every chosen digit must appear in every highlighted cell/i.test(item)), `${technique} should address the matching-lists misconception`);
}

const slowestLoad = measurements.reduce((slowest, item) => item.fixtureLoadMs > slowest.fixtureLoadMs ? item : slowest, measurements[0]);
const slowestHundred = measurements.reduce((slowest, item) => item.hundredStartsMs > slowest.hundredStartsMs ? item : slowest, measurements[0]);
console.log(`learning and practice contracts passed: ${measurements.length} strategies, 5100/5100 starts`);
console.log(`slowest precomputed fixture load: ${slowestLoad.technique} ${slowestLoad.fixtureLoadMs.toFixed(1)}ms`);
console.log(`slowest 100-start strategy: ${slowestHundred.technique} ${slowestHundred.mode} ${slowestHundred.hundredStartsMs.toFixed(1)}ms`);

function assertCompletionTrace(fixture) {
  const puzzle = clonePuzzle(fixture.puzzle);
  assert.equal(fixture.completionTrace[0].technique, fixture.technique, `${fixture.id} path must start with the target technique`);
  for (const expected of fixture.completionTrace) {
    const move = findAllMoves(puzzle, [expected.technique]).find((candidate) => actionKey(candidate) === actionKey(expected));
    assert.ok(move, `${fixture.id} must replay ${expected.technique}`);
    applyMove(puzzle, move);
  }
  assert.ok(isSolved(puzzle.values), `${fixture.id} completion trace must solve the board`);
}

function actionKey(move) {
  return [
    move.technique,
    ...move.fills.map(({ index, digit }) => `f${index}-${digit}`).sort(),
    ...move.eliminations.map(({ index, digit }) => `e${index}-${digit}`).sort()
  ].join("|");
}

function effectKey(move) {
  return [
    ...move.fills.map(({ index, digit }) => `f${index}-${digit}`).sort(),
    ...move.eliminations.map(({ index, digit }) => `e${index}-${digit}`).sort()
  ].join("|");
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
