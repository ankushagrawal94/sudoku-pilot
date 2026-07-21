import { expect, test } from "@playwright/test";

const NEARLY_SOLVED_GRID = "534678912672195348198342567859761423426853791713924856961537284287419635345286170";

async function installAnalyticsClient(page) {
  await page.addInitScript(() => {
    window.__SUDOKU_ANALYTICS_CALLS__ = [];
    window.__SUDOKU_ANALYTICS_CLIENT__ = {
      init(key, options) {
        window.__SUDOKU_ANALYTICS_CALLS__.push(["init", key, {
          api_host: options.api_host,
          autocapture: options.autocapture,
          capture_pageview: options.capture_pageview,
          persistence: options.persistence
        }]);
      },
      capture(event, properties) {
        window.__SUDOKU_ANALYTICS_CALLS__.push(["capture", event, properties]);
      }
    };
  });
}

async function capturedEvents(page) {
  return page.evaluate(() => window.__SUDOKU_ANALYTICS_CALLS__
    .filter(([kind]) => kind === "capture")
    .map(([, event, properties]) => ({ event, properties })));
}

async function importGrid(page, grid) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();
  await page.evaluate((puzzle) => {
    document.querySelectorAll("[data-import-cell]").forEach((input, index) => {
      input.value = puzzle[index] === "0" ? "" : puzzle[index];
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }, grid);
  await page.locator("[data-action='apply-import']").click();
}

test("records app, puzzle, first-move, meaningful-play, and hint milestones", async ({ page }) => {
  await installAnalyticsClient(page);
  await page.goto("/");

  for (let index = 0; index < 5; index += 1) {
    const cell = page.locator(".cell:not(.given)").nth(index);
    await cell.click();
    await page.locator("[data-digit='1']").click();
  }
  await page.getByTestId("hint-button").click();

  await expect.poll(async () => (await capturedEvents(page)).map(({ event }) => event)).toEqual([
    "app_opened",
    "puzzle_started",
    "puzzle_first_move",
    "puzzle_meaningful_play",
    "hint_requested"
  ]);
});

test("records persisted puzzle resumes without duplicating a puzzle start", async ({ page }) => {
  await installAnalyticsClient(page);
  await page.goto("/");
  const cell = page.locator(".cell:not(.given)").first();
  await cell.click();
  await page.locator("[data-digit='1']").click();
  await page.reload();

  await expect.poll(async () => (await capturedEvents(page)).map(({ event }) => event)).toEqual([
    "app_opened",
    "puzzle_resumed"
  ]);
});

test("records note-only starts and persisted resumes", async ({ page }) => {
  await installAnalyticsClient(page);
  await page.goto("/");
  await page.locator(".cell:not(.given)").first().click();
  await page.getByRole("switch", { name: "Notes", exact: true }).click();
  await page.locator("[data-digit='1']").click();

  await expect.poll(async () => (await capturedEvents(page)).map(({ event }) => event)).toEqual([
    "app_opened",
    "puzzle_started"
  ]);
  await page.reload();
  await expect.poll(async () => (await capturedEvents(page)).map(({ event }) => event)).toEqual([
    "app_opened",
    "puzzle_resumed"
  ]);
});

test("tracks near-miss practice without counting it as a puzzle", async ({ page }) => {
  await installAnalyticsClient(page);
  await page.goto("/");
  await page.locator("[data-view='practice']").click();
  await page.locator("[data-practice-mode='near-miss']").click();
  await page.locator("[data-action='start-certified-practice']").click();

  await expect.poll(async () => (await capturedEvents(page)).map(({ event }) => event)).toContain("practice_started");
  const events = await capturedEvents(page);
  expect(events.map(({ event }) => event)).not.toContain("puzzle_started");
});

test("tracks each viewed lesson once per app session", async ({ page }, testInfo) => {
  await installAnalyticsClient(page);
  await page.goto("/");
  await page.locator("[data-view='learn']").click();
  if (testInfo.project.name === "mobile") {
    const select = page.locator("[data-lesson-select]");
    await select.selectOption({ index: 1 });
    await select.dispatchEvent("change");
  } else {
    await page.locator("[data-lesson-technique]").nth(1).click();
    await page.locator("[data-lesson-technique]").nth(1).click();
  }

  await expect.poll(async () => (await capturedEvents(page)).filter(({ event }) => event === "lesson_viewed").length).toBe(2);
  const lessons = (await capturedEvents(page)).filter(({ event }) => event === "lesson_viewed");
  expect(new Set(lessons.map(({ properties }) => properties.technique)).size).toBe(2);
});

test("records imported puzzle completion without sending the grid", async ({ page }) => {
  await installAnalyticsClient(page);
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  const completion = await expect.poll(async () => (await capturedEvents(page)).find(({ event }) => event === "puzzle_completed")).not.toBeUndefined();
  const events = await capturedEvents(page);
  const completed = events.find(({ event }) => event === "puzzle_completed");
  expect(completed.properties).toMatchObject({ source: "import", moves: 1, hints_used: 0 });
  expect(JSON.stringify(events)).not.toContain(NEARLY_SOLVED_GRID);
});
