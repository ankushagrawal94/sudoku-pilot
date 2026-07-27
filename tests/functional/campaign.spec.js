import { expect, test } from "@playwright/test";

const CAMPAIGN_URL = "/?campaign=1&view=campaign";

test("campaign stays absent when the local feature flag is off", async ({ page }) => {
  await page.goto("/?view=campaign");

  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("campaign-view")).toHaveCount(0);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open campaign", exact: true })).toHaveCount(0);
});

test("campaign starts from observed solving without requiring profile answers", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  await expect(page.getByText("No questionnaire is required")).toBeVisible();
  await expect(page.locator("[data-campaign-goal]")).not.toBeVisible();

  await page.getByRole("button", { name: "Start with a puzzle" }).click();
  await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "find-pattern");
  await expect(page.getByTestId("campaign-activity-banner")).toContainText("Starting-point puzzle");
  await page.getByTestId("hint-button").click();
  for (let stage = 2; stage <= 4; stage += 1) {
    await page.getByTestId("hint-panel").getByRole("button", { name: "Next clue", exact: true }).click();
  }
  await page.getByTestId("hint-panel").getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "See my next activity" }).click();

  await expect(page.getByTestId("campaign-recommendation")).toBeVisible();
  await expect(page.getByTestId("campaign-inferred-path")).toContainText("Build confidence");
  await expect(page.getByTestId("campaign-inferred-path")).toContainText("inferred provisionally");
  const inferredSnapshot = await readCampaignDatabase(page);
  expect(inferredSnapshot.profiles[0].goalSource).toBe("observed");
  expect(inferredSnapshot.profiles[0].goalInference.policyVersion).toBe(1);

  await page.getByText("Adjust this path").click();
  await page.locator("[data-campaign-goal-correction]").selectOption("learn-techniques");
  await page.getByRole("button", { name: "Save path" }).click();
  await expect(page.getByTestId("campaign-inferred-path")).toContainText("Learn techniques efficiently");
  await expect(page.getByTestId("campaign-inferred-path")).not.toContainText("inferred provisionally");

  const snapshot = await readCampaignDatabase(page);
  expect(snapshot.profiles[0].goalSource).toBe("observed");
  expect(snapshot.profiles[0].goalInference.policyVersion).toBe(1);
  expect(snapshot.evidence_events.some((item) => item.eventType === "exact_move_revealed")).toBe(true);
  expect(snapshot.evidence_events.some((item) => item.eventType === "placement_check_completed" && item.payload.result === "needs-practice")).toBe(true);
  expect(snapshot.evidence_events.some((item) => item.eventType === "profile_corrected" && item.techniqueId === null && item.payload.goal === "learn-techniques")).toBe(true);
});

test("optional self-report can skip ahead, run a recognition check, and be corrected later", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await page.getByText("Optional: tell us your preferences or what you know").click();
  await page.getByRole("button", { name: "Mark Tier 1 “Know it”" }).click();
  await page.locator("[data-campaign-check-technique]").selectOption("hidden-pair");
  await page.getByRole("button", { name: "Try recognition check" }).click();

  await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "near-miss");
  await expect(page.getByTestId("campaign-activity-banner")).toContainText("Placement recognition check");
  await page.getByRole("button", { name: "Yes, it is valid", exact: true }).click();
  await page.getByRole("button", { name: "Finish check", exact: true }).click();

  await expect(page.getByTestId("campaign-placement")).toBeVisible();
  await page.getByText("Optional: tell us your preferences or what you know").click();
  await page.getByRole("button", { name: "Use these answers" }).click();
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
  await page.getByRole("button", { name: "Ignore these answers" }).click();
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
  await page.getByRole("button", { name: "Use these answers" }).click();
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
  await page.getByRole("button", { name: "Use these answers" }).click();
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

  await page.getByRole("button", { name: "Start with a puzzle" }).click();
  await expect(page.getByTestId("practice-session")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("campaign data can be exported, reset, and deleted without puzzle contents", async ({ page }) => {
  await page.goto(CAMPAIGN_URL);
  await openOptionalPlacement(page);
  await page.getByRole("button", { name: "Ignore these answers" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let exported = "";
  for await (const chunk of stream) exported += chunk.toString();
  expect(JSON.parse(exported).schemaVersion).toBe(1);
  expect(exported).not.toMatch(/"grid"|"solution"|"candidateMap"|"notes"|"exactMove"/i);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset skill graph and history" }).click();
  await expect(page.getByTestId("campaign-placement")).toBeVisible();

  await openOptionalPlacement(page);
  await page.getByRole("button", { name: "Ignore these answers" }).click();
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
  await page.getByRole("button", { name: "Ignore these answers" }).click();
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
    await page.getByText("Optional: tell us your preferences or what you know").click();
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
