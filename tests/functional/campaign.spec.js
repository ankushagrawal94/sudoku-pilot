import { expect, test } from "@playwright/test";
import { techniqueIdForName } from "../../src/campaign/index.js";
import { COMMITTED_COACHING_TECHNIQUES } from "../../src/puzzles.js";
import { findAllMoves } from "../../src/solver.js";

const CAMPAIGN_URL = "/?campaign=1&view=campaign";

test("campaign stays absent when the local feature flag is off", async ({ page }) => {
  await page.goto("/?view=campaign");

  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("campaign-view")).toHaveCount(0);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open campaign", exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-pilot-state-v1") || "{}"));
  expect(saved.solveRunId || null).toBeNull();
  expect(await page.evaluate(async () => (await indexedDB.databases()).some((database) => database.name === "sudoku-pilot-solve-transcripts"))).toBe(false);
});

test("campaign starts from observed solving without requiring profile answers", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  await expect(page.getByTestId("campaign-puzzle-start")).toContainText("Start with a puzzle");
  await expect(page.getByTestId("campaign-knowledge-start")).toContainText("Tell us what you know");
  await expect(page.locator("[data-campaign-goal]")).not.toBeVisible();

  await expect(page.locator("[data-campaign-start-difficulty]")).toHaveValue("easy");
  await page.getByRole("button", { name: "Start puzzle" }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("campaign-placement-puzzle-banner")).toContainText("Easy · complete Sudoku");
  await expect(page.locator("[data-difficulty='easy']")).toHaveClass(/active/);
  await expect(page.getByTestId("practice-session")).toHaveCount(0);

  const startedSnapshot = await readCampaignDatabase(page);
  const placementActivity = startedSnapshot.activities.find((activity) => activity.activityType === "placement-puzzle");
  expect(placementActivity).toBeTruthy();
  expect(placementActivity.focusTechniqueId).toBeNull();
  expect(placementActivity.certificationSnapshot).toMatchObject({
    diagnostic: true,
    difficulty: "easy",
    noveltyBudget: null
  });
  const savedPuzzle = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-pilot-state-v1")));
  expect(savedPuzzle.puzzleSource).toBe("campaign-placement");
  expect(savedPuzzle.campaignPuzzleCanonicalId).toBe(placementActivity.canonicalPuzzleId);

  const evidenceCountBeforeReload = startedSnapshot.evidence_events.length;
  await page.reload();
  await expect(page.getByTestId("campaign-placement-puzzle-banner")).toBeVisible();
  const resumedSnapshot = await readCampaignDatabase(page);
  expect(resumedSnapshot.activities).toHaveLength(startedSnapshot.activities.length);
  expect(resumedSnapshot.evidence_events).toHaveLength(evidenceCountBeforeReload);
  expect(resumedSnapshot.campaign_state[0].currentActivityId).toBe(placementActivity.activityId);
  await page.getByRole("button", { name: "Back to campaign" }).click();
  await expect(page.getByTestId("campaign-recommendation")).toContainText("Your Easy Sudoku is in progress");
  await page.getByRole("button", { name: "Resume puzzle" }).click();
  await expect(page.getByTestId("campaign-placement-puzzle-banner")).toBeVisible();

  await solveSavedPuzzle(page);
  await expect(page.getByTestId("completion-celebration")).toBeVisible();
  await page.getByRole("button", { name: "Continue campaign" }).click();

  await expect(page.getByTestId("campaign-recommendation")).toBeVisible();
  await expect(page.getByTestId("campaign-inferred-path")).toContainText("Solve more puzzles");
  await expect(page.getByTestId("campaign-inferred-path")).toContainText("inferred provisionally");
  const inferredSnapshot = await readCampaignDatabase(page);
  expect(inferredSnapshot.profiles[0].goalSource).toBe("observed");
  expect(inferredSnapshot.profiles[0].goalInference.policyVersion).toBe(1);
  expect(inferredSnapshot.activities.find((activity) => activity.activityId === placementActivity.activityId).completedAt).toBeTruthy();
  expect(inferredSnapshot.evidence_events.some((item) => item.activityId === placementActivity.activityId && item.eventType === "target_recognized")).toBe(true);
  expect(inferredSnapshot.evidence_events.some((item) => item.activityId === placementActivity.activityId && item.eventType === "activity_completed")).toBe(true);
  expect(JSON.stringify(inferredSnapshot.evidence_events)).not.toMatch(/"grid"|"solution"|"candidateMap"|"notes"|"exactMove"/i);

  await page.getByText("Adjust this path").click();
  await page.locator("[data-campaign-goal-correction]").selectOption("learn-techniques");
  await page.getByRole("button", { name: "Save path" }).click();
  await expect(page.getByTestId("campaign-inferred-path")).toContainText("Learn techniques efficiently");
  await expect(page.getByTestId("campaign-inferred-path")).not.toContainText("inferred provisionally");

  const snapshot = await readCampaignDatabase(page);
  expect(snapshot.profiles[0].goalSource).toBe("observed");
  expect(snapshot.profiles[0].goalInference.policyVersion).toBe(1);
  expect(snapshot.evidence_events.some((item) => item.eventType === "profile_corrected" && item.techniqueId === null && item.payload.goal === "learn-techniques")).toBe(true);
});

test("puzzle-first placement honors the learner's selected level", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await page.locator("[data-campaign-start-difficulty]").selectOption("hard");
  await page.getByRole("button", { name: "Start puzzle" }).click();

  await expect(page.getByTestId("campaign-placement-puzzle-banner")).toContainText("Hard · complete Sudoku");
  await expect(page.locator("[data-difficulty='hard']")).toHaveClass(/active/);
  const snapshot = await readCampaignDatabase(page);
  const activity = snapshot.activities.find((item) => item.activityType === "placement-puzzle");
  expect(activity.certificationSnapshot.difficulty).toBe("hard");
  expect(activity.recommendationSnapshot.reasonCodes).toContain("LEARNER_SELECTED_PUZZLE_LEVEL");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("sudoku-pilot-state-v1"))).difficulty).toBe("hard");
});

test("normal play records a resumable local transcript and pre-fills technique perception", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator("[data-difficulty='easy']").click();

  const savedPuzzle = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-pilot-state-v1")).puzzle);
  const puzzle = {
    ...savedPuzzle,
    notes: savedPuzzle.notes.map((digits) => new Set(digits)),
    eliminated: savedPuzzle.eliminated.map((digits) => new Set(digits)),
    history: []
  };
  const grouped = new Map();
  for (const candidate of findAllMoves(puzzle, COMMITTED_COACHING_TECHNIQUES)) {
    for (const fill of candidate.fills || []) {
      const key = `${fill.index}:${fill.digit}`;
      if (!grouped.has(key)) grouped.set(key, new Set());
      grouped.get(key).add(candidate.technique);
    }
  }
  const unique = [...grouped.entries()].find(([, techniques]) => techniques.size === 1);
  const move = unique
    ? { cell: Number(unique[0].split(":")[0]), digit: Number(unique[0].split(":")[1]), technique: [...unique[1]][0] }
    : null;
  expect(move).toBeTruthy();

  await page.locator(`[data-cell="${move.cell}"]`).click();
  await page.locator(`[data-digit="${move.digit}"]`).click();
  await expect.poll(() => page.evaluate((technique) => {
    const rows = JSON.parse(localStorage.getItem("sudoku-pilot-account-techniques-v1") || "[]");
    return rows.find((row) => row.technique_id === technique)?.independent_successes || 0;
  }, move.technique)).toBeGreaterThan(0);

  await expect.poll(async () => {
    const runs = await readSolveTranscriptDatabase(page);
    return runs.some((run) => run.source === "generated" && run.events.some((event) => event[7] >= 0));
  }).toBe(true);
  const observedTechniqueId = techniqueIdForName(move.technique);
  await expect.poll(async () => {
    const snapshot = await readCampaignDatabase(page);
    return snapshot.evidence_events.filter((event) => (
      event.techniqueId === observedTechniqueId &&
      event.eventType === "target_recognized" &&
      event.payload?.recognitionKind === "ordinary-play"
    )).length;
  }).toBe(1);
  const observedSnapshot = await readCampaignDatabase(page);
  const ordinaryObservation = observedSnapshot.evidence_events.find((event) => (
    event.techniqueId === observedTechniqueId &&
    event.payload?.recognitionKind === "ordinary-play"
  ));
  expect(ordinaryObservation).toMatchObject({
    activityId: null,
    assistanceLevel: "none",
    canonicalPuzzleId: savedPuzzle.canonicalId,
    payload: {
      source: "generated",
      inferencePolicyVersion: 1,
      observationPolicyVersion: 1
    }
  });
  expect(ordinaryObservation.puzzleStateFingerprint).toMatch(/^state-v1-[0-9a-f]{8}$/);
  expect(JSON.stringify(ordinaryObservation)).not.toMatch(/"grid"|"solution"|"candidate"|"notes"|"exactMove"/i);
  const beforeReload = await readSolveTranscriptDatabase(page);
  const activeRun = beforeReload.find((run) => !run.completedAt && run.source === "generated");
  expect(activeRun).toBeTruthy();
  expect(activeRun.storageScope).toBe("local-only");
  expect(activeRun.events.some((event) => event[7] >= 0)).toBe(true);
  expect(activeRun.initialValues).toHaveLength(81);

  await page.reload();
  await expect(page.getByTestId("board")).toBeVisible();
  const afterReload = await readSolveTranscriptDatabase(page);
  expect(afterReload.filter((run) => run.runId === activeRun.runId)).toHaveLength(1);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("sudoku-pilot-state-v1"))).solveRunId).toBe(activeRun.runId);
  const afterReloadCampaign = await readCampaignDatabase(page);
  expect(afterReloadCampaign.evidence_events.filter((event) => (
    event.techniqueId === observedTechniqueId &&
    event.payload?.recognitionKind === "ordinary-play"
  ))).toHaveLength(1);

  await page.goto(CAMPAIGN_URL);
  await openOptionalPlacement(page);
  await expect(page.locator(`[data-campaign-placement-technique="${observedTechniqueId}"] input[value="learning"]`)).toBeChecked();
  await expect(page.getByText(/current technique estimates are pre-filled/i)).toBeVisible();
});

test("knowledge-first placement falls back to a profile-matched puzzle when everything is known", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await openOptionalPlacement(page);
  await page.evaluate(() => {
    document.querySelectorAll("[data-campaign-placement-technique]").forEach((row) => {
      row.querySelector('input[value="known"]').checked = true;
    });
  });
  await page.getByRole("button", { name: "Choose my next puzzle" }).click();

  await expect(page.getByTestId("campaign-placement-puzzle-banner")).toContainText("Extreme · complete Sudoku");
  const snapshot = await readCampaignDatabase(page);
  expect(snapshot.profiles[0].placementMethod).toBe("self-report+puzzle");
  const activity = snapshot.activities.find((item) => item.activityType === "placement-puzzle");
  expect(activity.placementSelectionBasis).toBe("knowledge-profile");
  expect(activity.recommendationSnapshot.reasonCodes).toContain("KNOWLEDGE_PROFILE_PUZZLE_LEVEL");
  expect(snapshot.evidence_events.filter((item) => item.eventType === "placement_self_reported")).toHaveLength(17);
});

test("optional self-report can skip ahead, run a recognition check, and be corrected later", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await page.getByText("Tell us what you know", { exact: true }).click();
  await page.getByRole("button", { name: "Mark Tier 1 “Know it”" }).click();
  await page.locator("[data-campaign-check-technique]").selectOption("hidden-pair");
  await page.getByRole("button", { name: "Try recognition check" }).click();

  await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "near-miss");
  await expect(page.getByTestId("campaign-activity-banner")).toContainText("Placement recognition check");
  await page.getByRole("button", { name: "Yes, it is valid", exact: true }).click();
  await page.getByRole("button", { name: "Finish check", exact: true }).click();

  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  await openOptionalPlacement(page);
  await expect(page.getByRole("radio", { name: "Hidden Pair: Know it" })).toBeChecked();
  await page.getByRole("button", { name: "Choose my next puzzle" }).click();
  const recommendation = page.getByTestId("campaign-recommendation");
  await expect(recommendation).toBeVisible();
  await expect(recommendation).not.toContainText(/^Last Digit$/);
  await expect(recommendation.getByTestId("campaign-reason")).not.toBeEmpty();

  await page.getByRole("button", { name: "Inspect and correct" }).click();
  const hiddenPair = page.locator('[data-campaign-skill="hidden-pair"]');
  await hiddenPair.locator("[data-campaign-correction]").selectOption("learning");
  await hiddenPair.getByRole("button", { name: "Save correction" }).click();
  await expect(hiddenPair).toContainText("Learning");

  const snapshot = await readCampaignDatabase(page);
  expect(snapshot.evidence_events.some((item) => item.eventType === "profile_corrected" && item.techniqueId === "hidden-pair")).toBe(true);
  expect(JSON.stringify(snapshot.evidence_events)).not.toMatch(/"grid"|"solution"|"candidateMap"|"notes"|"exactMove"/i);
});

test("lesson completion persists atomically and offers another activity immediately", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await openOptionalPlacement(page);
  await page.getByRole("button", { name: "Skip these answers" }).click();
  const firstRecommendation = page.getByTestId("campaign-recommendation");
  const firstActivityId = await firstRecommendation.getAttribute("data-activity-id");
  await firstRecommendation.getByRole("button", { name: "Start activity" }).click();

  await expect(page.getByTestId("lesson-browser")).toBeVisible();
  await expect(page.getByTestId("campaign-activity-banner")).toBeVisible();
  await page.getByRole("button", { name: "Continue campaign" }).click();

  await expect(page.getByTestId("campaign-reflection")).toContainText("Completion was recorded as exposure, not proof of mastery");
  const nextRecommendation = page.getByTestId("campaign-recommendation");
  await expect(nextRecommendation).toBeVisible();
  await expect(nextRecommendation).not.toHaveAttribute("data-activity-id", firstActivityId);

  const snapshot = await readCampaignDatabase(page);
  const completed = snapshot.activities.find((activity) => activity.activityId === firstActivityId);
  const campaignState = snapshot.campaign_state[0];
  expect(completed.completedAt).toBeTruthy();
  expect(campaignState.campaignSequence).toBe(1);
  expect(campaignState.currentActivityId).not.toBe(firstActivityId);
  expect(snapshot.evidence_events.some((item) => item.activityId === firstActivityId && item.eventType === "activity_completed")).toBe(true);
  expect(snapshot.evidence_events.some((item) => item.activityId === firstActivityId && item.eventType === "target_recognized")).toBe(false);
});

test("an incomplete focused activity resumes after reload without duplicate assignment or evidence", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await setPlacementExcept(page, "last-digit", "learning");
  await page.getByRole("button", { name: "Choose my next puzzle" }).click();
  await expect(page.getByTestId("campaign-recommendation")).toContainText("Last Digit");
  await expect(page.getByTestId("campaign-recommendation")).toContainText("Find the pattern");
  const activityId = await page.getByTestId("campaign-recommendation").getAttribute("data-activity-id");
  await page.getByRole("button", { name: "Start activity" }).click();

  await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "find-pattern");
  const before = await readCampaignDatabase(page);
  const startedBefore = before.evidence_events.filter((item) => item.activityId === activityId && item.eventType === "activity_started").length;
  const activityCountBefore = before.activities.length;

  await page.reload();
  await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "find-pattern");
  await expect(page.getByTestId("campaign-activity-banner")).toContainText("Your progress is saved locally");
  const after = await readCampaignDatabase(page);
  expect(after.activities).toHaveLength(activityCountBefore);
  expect(after.campaign_state[0].currentActivityId).toBe(activityId);
  expect(after.evidence_events.filter((item) => item.activityId === activityId && item.eventType === "activity_started")).toHaveLength(startedBefore);
});

test("exact-move assistance is recorded and cannot grant mastery", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await setPlacementExcept(page, "last-digit", "learning");
  await page.getByRole("button", { name: "Choose my next puzzle" }).click();
  await page.getByRole("button", { name: "Start activity" }).click();

  await page.getByTestId("hint-button").click();
  for (let stage = 2; stage <= 4; stage += 1) {
    await page.getByTestId("hint-panel").getByRole("button", { name: "Next clue", exact: true }).click();
  }
  await page.getByTestId("hint-panel").getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("campaign-activity-banner").getByRole("button", { name: "Continue campaign" })).toBeVisible();
  await page.getByTestId("campaign-activity-banner").getByRole("button", { name: "Continue campaign" }).click();

  await expect(page.getByTestId("campaign-reflection")).toContainText("exact-move assistance");
  await page.getByRole("button", { name: "Inspect and correct" }).click();
  const skill = page.locator('[data-campaign-skill="last-digit"]');
  await expect(skill).not.toContainText("Mastered");
  const snapshot = await readCampaignDatabase(page);
  expect(snapshot.evidence_events.some((item) => item.eventType === "exact_move_revealed" && item.techniqueId === "last-digit")).toBe(true);
  expect(snapshot.evidence_events.some((item) => item.eventType === "target_recognized" && item.assistanceLevel === "exact-move")).toBe(true);
});

test("campaign is usable at mobile width without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto(CAMPAIGN_URL);
  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Start puzzle" }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("campaign-placement-puzzle-banner")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("campaign data can be exported, reset, and deleted without puzzle contents", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await openOptionalPlacement(page);
  await page.getByRole("button", { name: "Skip these answers" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let exported = "";
  for await (const chunk of stream) exported += chunk.toString();
  expect(JSON.parse(exported).schemaVersion).toBe(1);
  expect(exported).not.toMatch(/"grid"|"solution"|"candidateMap"|"notes"|"exactMove"/i);
  expect(exported).not.toMatch(/"initialValues"|"containsPuzzleContent"/);

  await expect(page.getByTestId("campaign-transcript-summary")).toContainText("local run");
  const transcriptDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export solve transcripts" }).click();
  const transcriptDownload = await transcriptDownloadPromise;
  const transcriptStream = await transcriptDownload.createReadStream();
  let transcriptExport = "";
  for await (const chunk of transcriptStream) transcriptExport += chunk.toString();
  const transcriptData = JSON.parse(transcriptExport);
  expect(transcriptData.storageScope).toBe("local-only");
  expect(transcriptData.containsPuzzleContent).toBe(true);
  expect(transcriptData.runs[0].initialValues).toHaveLength(81);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete solve transcripts" }).click();
  await expect(page.getByTestId("campaign-transcript-summary")).toContainText("0 local runs");
  expect(await readSolveTranscriptDatabase(page)).toHaveLength(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset skill graph and history" }).click();
  await expect(page.getByTestId("campaign-placement")).toBeVisible();

  await openOptionalPlacement(page);
  await page.getByRole("button", { name: "Skip these answers" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete campaign data" }).click();
  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  const snapshot = await readCampaignDatabase(page);
  expect(snapshot.profiles).toHaveLength(0);
  expect(snapshot.evidence_events).toHaveLength(0);
  expect(snapshot.activities).toHaveLength(0);
});

test("campaign placement and continuation work offline after first load", async ({ page, context }) => {
  await page.goto(CAMPAIGN_URL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  await openOptionalPlacement(page);
  await page.getByRole("button", { name: "Skip these answers" }).click();
  await expect(page.getByTestId("campaign-recommendation")).toBeVisible();
  await page.getByRole("button", { name: "Start activity" }).click();
  await expect(page.getByTestId("lesson-browser")).toBeVisible();
  await page.getByRole("button", { name: "Continue campaign" }).click();
  await expect(page.getByTestId("campaign-recommendation")).toBeVisible();
  await context.setOffline(false);
});

async function setPlacementExcept(page, exceptionId, exceptionStatus) {
  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  await openOptionalPlacement(page);
  await page.evaluate(({ exceptionId: id, exceptionStatus: status }) => {
    document.querySelectorAll("[data-campaign-placement-technique]").forEach((row) => {
      const value = row.dataset.campaignPlacementTechnique === id ? status : "known";
      const input = row.querySelector(`input[value="${value}"]`);
      input.checked = true;
    });
  }, { exceptionId, exceptionStatus });
}

async function openOptionalPlacement(page) {
  const details = page.locator(".campaign-optional-placement");
  if (!await details.getAttribute("open")) {
    await page.getByText("Tell us what you know", { exact: true }).click();
  }
}

async function readCampaignDatabase(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sudoku-pilot-campaign");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ["profiles", "evidence_events", "activities", "campaign_state"];
    const result = {};
    for (const storeName of stores) {
      result[storeName] = await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    database.close();
    return result;
  });
}

async function readSolveTranscriptDatabase(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sudoku-pilot-solve-transcripts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const runs = await new Promise((resolve, reject) => {
      const transaction = database.transaction("runs", "readonly");
      const request = transaction.objectStore("runs").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return runs;
  });
}

async function solveSavedPuzzle(page) {
  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-pilot-state-v1")).puzzle);
  for (let index = 0; index < 81; index += 1) {
    if (puzzle.givens[index]) continue;
    await page.locator(`[data-cell="${index}"]`).click();
    await page.locator(`[data-digit="${puzzle.solution[index]}"]`).click();
  }
}
