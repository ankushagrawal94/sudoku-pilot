import { expect, test } from "@playwright/test";
import { TECHNIQUE_LESSONS } from "../../src/learning.js";
import { COMMITTED_COACHING_TECHNIQUES } from "../../src/puzzles.js";

for (const technique of COMMITTED_COACHING_TECHNIQUES) {
  test(`${technique} has a complete navigable lesson and direct practice transition`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Learn", exact: true }).click();
    await page.locator("[data-lesson-select]").selectOption(technique);
    const lesson = page.getByTestId("lesson-browser").locator(".lesson-content");
    await expect(lesson).toHaveAttribute("data-technique", technique);
    await expect(lesson.getByTestId("lesson-visual").getByRole("img")).toHaveAttribute("aria-label", `Exact ${technique} explanation board`);
    for (const section of ["what-it-is", "how-to-recognize", "why-it-works", "worked-example", "common-mistakes", "try-it"]) {
      await expect(lesson.locator(`[data-lesson-section='${section}']`)).toBeVisible();
    }
    await expect(lesson.getByRole("heading", { name: "Before you make the move", exact: true })).toBeVisible();
    await expect(lesson.locator("[data-lesson-section='why-it-works'] > p")).toBeVisible();
    await expect(lesson.locator("[data-lesson-section='why-it-works'] details p")).toBeHidden();
    await expect(lesson.locator(".near-miss-note")).toContainText("A look-alike that does not work:");
    if (TECHNIQUE_LESSONS[technique].whatItIs.terms.length) await expect(lesson.locator("[data-lesson-section='words-used']")).toBeVisible();

    const before = await lesson.getByTestId("lesson-stage-message").textContent();
    for (let stage = 2; stage <= 4; stage += 1) await lesson.getByRole("button", { name: "Next stage", exact: true }).click();
    await expect(lesson.locator(".worked-example [data-visual-stage='4']")).toBeVisible();
    await expect(lesson.locator("[data-visual-role='evidence']")).not.toHaveCount(0);
    await expect(lesson.locator(".text-equivalent")).toBeVisible();
    await expect(lesson.locator(".actions-list")).toBeVisible();
    await expect(lesson.getByTestId("lesson-stage-message")).not.toHaveText(before);
    await assertNoHorizontalOverflow(page, lesson);

    await lesson.getByRole("button", { name: `Practice ${technique}`, exact: true }).click();
    await expect(page.getByTestId("practice-session")).toHaveAttribute("data-technique", technique);
    await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "find-pattern");
    await expect(page.getByTestId("practice-session")).not.toContainText(/solution-safe|committed-technique|certified|provisional/i);
  });
}

test("learn opens on Hidden Pair with tier labels only in the selector and pagination at the bottom", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Learn", exact: true }).click();

  await expect(page.locator("[data-lesson-select]")).toHaveValue("Hidden Pair");
  await expect(page.getByTestId("lesson-browser")).not.toContainText(/Tier [12] lesson|Tier [12] ·/);
  await expect(page.locator("[data-lesson-select] optgroup")).toHaveCount(2);
  await expect(page.locator("[data-lesson-select] optgroup").nth(0)).toHaveAttribute("label", "Tier 1 · Foundations");
  await expect(page.locator("[data-lesson-select] optgroup").nth(1)).toHaveAttribute("label", "Tier 2 · Advanced");

  const lesson = page.locator(".lesson-content");
  const pagination = lesson.locator(".lesson-pagination");
  await expect(pagination).toHaveCount(1);
  await expect(pagination).toContainText("7 of 17");
  expect(await pagination.evaluate((element) => element.previousElementSibling?.dataset.lessonSection)).toBe("try-it");
});

for (const technique of COMMITTED_COACHING_TECHNIQUES) {
  test(`${technique} supports find, complete, and near-miss practice`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page.locator("[data-practice-technique]").selectOption(technique);

    const findStarted = Date.now();
    await page.getByRole("button", { name: "Start Find the pattern", exact: true }).click();
    await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "find-pattern");
    expect(Date.now() - findStarted).toBeLessThan(testInfo.project.name === "mobile" ? 3_000 : 2_000);
    await page.getByTestId("hint-button").click();
    await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-technique", technique);

    await page.getByRole("tab", { name: "Complete the puzzle", exact: true }).click();
    const completeStarted = Date.now();
    await page.getByRole("button", { name: "Start Complete the puzzle", exact: true }).click();
    await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "complete-puzzle");
    expect(Date.now() - completeStarted).toBeLessThan(testInfo.project.name === "mobile" ? 3_000 : 2_000);
    const before = await boardSignature(page);
    await page.getByTestId("hint-button").click();
    await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-technique", technique);
    for (let stage = 2; stage <= 4; stage += 1) await page.getByTestId("hint-panel").getByRole("button", { name: "Next clue", exact: true }).click();
    await page.getByTestId("hint-panel").getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByTestId("practice-session").locator(".practice-success")).toBeVisible();
    expect(await boardSignature(page)).not.toEqual(before);
    await page.locator("[data-action='undo']").click();
    expect(await boardSignature(page)).toEqual(before);

    await page.getByRole("tab", { name: "Near-miss recognition", exact: true }).click();
    const nearMissStarted = Date.now();
    await page.getByRole("button", { name: "Start Near-miss recognition", exact: true }).click();
    await expect(page.getByTestId("practice-session")).toHaveAttribute("data-practice-mode", "near-miss");
    expect(Date.now() - nearMissStarted).toBeLessThan(testInfo.project.name === "mobile" ? 3_000 : 2_000);
    await page.getByRole("button", { name: "Yes, it is valid", exact: true }).click();
    await expect(page.getByTestId("practice-result")).toContainText("Correct.");
    await expect(page.locator("[data-visual-role='elimination'], [data-visual-role='placement']")).not.toHaveCount(0);
    await page.getByRole("button", { name: "Start another example", exact: true }).click();
    await page.getByRole("button", { name: "No, one rule is broken", exact: true }).click();
    await expect(page.getByTestId("practice-result")).toContainText("Correct. No.");
    await assertNoHorizontalOverflow(page, page.getByTestId("practice-browser"));
  });
}

test("practice startup does not show a redundant ready message", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.locator("[data-practice-technique]").selectOption("Skyscraper");
  await page.getByRole("button", { name: "Start Find the pattern", exact: true }).click();

  await expect(page.getByTestId("practice-session")).toHaveAttribute("data-technique", "Skyscraper");
  await expect(page.getByTestId("run-message")).toHaveCount(0);
});

test("practice startup failure offers useful recovery without changing the puzzle", async ({ page }) => {
  await page.addInitScript(() => { window.__SUDOKU_FORCE_PRACTICE_FAILURE__ = true; });
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start Find the pattern", exact: true }).click();
  const error = page.getByTestId("practice-error");
  await expect(error).toContainText("could not start");
  await expect(error.getByRole("button", { name: "Retry this technique", exact: true })).toBeVisible();
  await expect(error.getByRole("button", { name: "Choose the next technique", exact: true })).toBeVisible();
  await expect(error.getByRole("button", { name: "Review the lesson", exact: true })).toBeVisible();
  await error.getByRole("button", { name: "Retry this technique", exact: true }).click();
  await expect(page.getByTestId("practice-session")).toBeVisible();
});

async function boardSignature(page) {
  return page.locator("[data-cell]").evaluateAll((cells) => cells.map((cell) => ({
    value: cell.querySelector(".value")?.textContent || "",
    notes: [...cell.querySelectorAll(".notes .on")].map((note) => note.textContent.trim()).sort()
  })));
}

async function assertNoHorizontalOverflow(page, locator) {
  const overflow = await locator.evaluate((element) => ({
    panel: element.scrollWidth - element.clientWidth,
    page: document.documentElement.scrollWidth - window.innerWidth
  }));
  expect(overflow.panel).toBeLessThanOrEqual(1);
  expect(overflow.page).toBeLessThanOrEqual(1);
}
