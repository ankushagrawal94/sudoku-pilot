import assert from "node:assert/strict";
import {
  createMemorySolveTranscriptStorage,
  createSolveTranscriptManager,
  estimateSolveRunBytes,
  replaySolveRun,
  SOLVE_TRANSCRIPT_ANALYZER_VERSION,
  SOLVE_TRANSCRIPT_CODEC_VERSION
} from "../src/solveTranscript.js";

const emptyPuzzle = () => ({
  values: Array(81).fill(0),
  eliminated: Array.from({ length: 81 }, () => new Set())
});

{
  const storage = createMemorySolveTranscriptStorage();
  const manager = createSolveTranscriptManager({
    storage,
    now: () => new Date("2026-07-27T10:00:00Z"),
    idFactory: () => "solve-run-1"
  });
  let run = await manager.startRun({
    source: "generated",
    difficulty: "easy",
    canonicalPuzzleId: "c1-test",
    puzzle: emptyPuzzle()
  });
  const afterManual = emptyPuzzle();
  afterManual.values[0] = 5;
  run = await manager.appendTransition(run.runId, {
    action: "manualEntry",
    before: emptyPuzzle(),
    after: afterManual,
    elapsedMs: 1200,
    observedTechniqueId: "naked-single"
  });
  const afterHint = structuredClone(afterManual);
  afterHint.values[2] = 4;
  afterHint.eliminated[1].add(3);
  run = await manager.appendTransition(run.runId, {
    action: "hintApply",
    before: afterManual,
    after: afterHint,
    elapsedMs: 2400,
    techniqueId: "pointing-candidates",
    assistanceLevel: "exact-move"
  });
  const afterUndo = structuredClone(afterManual);
  run = await manager.appendTransition(run.runId, {
    action: "undo",
    before: afterHint,
    after: afterUndo,
    elapsedMs: 3100
  });
  const eventCountBeforeReconcile = run.events.length;
  run = await manager.appendTransition(run.runId, {
    action: "resumeReconcile",
    before: afterUndo,
    after: structuredClone(afterUndo),
    elapsedMs: 3200
  });
  assert.equal(run.events.length, eventCountBeforeReconcile, "reload reconciliation should not duplicate unchanged state");

  assert.equal(run.codecVersion, SOLVE_TRANSCRIPT_CODEC_VERSION);
  assert.equal(run.analyzerVersion, SOLVE_TRANSCRIPT_ANALYZER_VERSION);
  assert.equal(run.storageScope, "local-only");
  assert.equal(run.containsPuzzleContent, true);
  assert.deepEqual(replaySolveRun(run), afterUndo);
  assert.deepEqual(run.techniqueTable, ["naked-single", "pointing-candidates"]);
  assert.equal(run.events[0][7], 0, "the uniquely observed technique should be dictionary encoded");
  assert.equal(run.events[1][8], 4, "exact-move assistance should use the deepest assistance code");

  const completed = await manager.completeRun(run.runId);
  assert.equal(completed.terminalStatus, "completed");
  assert.ok(completed.completedAt);
  const exported = await manager.exportData();
  assert.equal(exported.containsPuzzleContent, true);
  assert.match(exported.warning, /starting grids and exact solve actions/);
  assert.equal(exported.runs.length, 1);
  await manager.clearAll();
  assert.equal((await manager.summary()).runCount, 0);
}

{
  const storage = createMemorySolveTranscriptStorage();
  let sequence = 0;
  const manager = createSolveTranscriptManager({
    storage,
    now: () => new Date("2026-07-27T10:00:00Z"),
    idFactory: () => `compact-${sequence += 1}`
  });
  let run = await manager.startRun({ source: "generated", puzzle: emptyPuzzle() });
  let before = emptyPuzzle();
  for (let index = 0; index < 55; index += 1) {
    const after = structuredClone(before);
    after.values[index % 81] = (index % 9) + 1;
    run = await manager.appendTransition(run.runId, {
      action: "manualEntry",
      before,
      after,
      elapsedMs: index * 900,
      observedTechniqueId: "naked-single"
    });
    before = after;
  }
  assert.ok(
    estimateSolveRunBytes(run) < 8_000,
    `a typical compact solve transcript should stay under 8 KB, got ${estimateSolveRunBytes(run)} bytes`
  );
}

{
  const storage = createMemorySolveTranscriptStorage();
  let current = new Date("2026-01-01T10:00:00Z");
  let sequence = 0;
  const manager = createSolveTranscriptManager({
    storage,
    now: () => current,
    idFactory: () => `retained-${sequence += 1}`,
    maxRuns: 2,
    retentionDays: 90
  });
  for (let index = 0; index < 3; index += 1) {
    const run = await manager.startRun({ source: "generated", puzzle: emptyPuzzle() });
    await manager.completeRun(run.runId);
    current = new Date(current.getTime() + 1000);
  }
  assert.deepEqual((await manager.listRuns()).map((run) => run.runId), ["retained-2", "retained-3"]);
  current = new Date("2026-05-01T10:00:00Z");
  await manager.prune();
  assert.equal((await manager.summary()).runCount, 0, "completed transcripts older than 90 days should be deleted");
}

console.log("solve transcript contracts passed");
