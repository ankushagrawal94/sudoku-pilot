import { expect, test } from "@playwright/test";
import { buildCoachingMove } from "../../src/coaching.js";
import { COMMITTED_COACHING_TECHNIQUES } from "../../src/puzzles.js";
import { buildCanonicalCoachingFixtures } from "../fixtures/coaching-fixtures.js";

const fixtures = buildCanonicalCoachingFixtures();
const relationshipTechniques = new Set(["X-Wing", "Swordfish", "Skyscraper", "2-String Kite", "XY-Wing", "XYZ-Wing", "W-Wing"]);

for (const technique of COMMITTED_COACHING_TECHNIQUES) {
  test(`${technique} honors all four progressive coaching stages`, async ({ page }) => {
    const fixture = fixtures[technique];
    const coaching = buildCoachingMove(fixture.move, fixture.puzzle);
    await installFixture(page, fixture);
    await page.goto("/");

    const before = await boardSignature(page);
    await page.getByTestId("hint-button").click();
    const panel = page.getByTestId("hint-panel");

    await expect(panel).toHaveAttribute("data-hint-stage", "1");
    await expect(panel.getByTestId("hint-stage-message")).toHaveText(coaching.stages[0].message);
    await expect(panel.locator("[data-visual-stage]")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
    expect(await boardSignature(page)).toEqual(before);

    await panel.getByRole("button", { name: "Next clue", exact: true }).click();
    await expect(panel).toHaveAttribute("data-hint-stage", "2");
    await expect(panel.getByTestId("hint-stage-message")).toHaveText(coaching.stages[1].message);
    await expect(panel.getByTestId("hint-stage-message")).not.toContainText(/r\d+c\d+|row \d+|column \d+|block \d+/i);
    await expect(panel.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
    expect(await boardSignature(page)).toEqual(before);

    await panel.getByRole("button", { name: "Next clue", exact: true }).click();
    await expect(panel).toHaveAttribute("data-hint-stage", "3");
    await expect(panel.getByTestId("hint-stage-message")).toHaveText(coaching.stages[2].message);
    await expect(panel.locator("[data-visual-stage='3']")).toBeVisible();
    await expect(panel.locator("[data-visual-role='search-region']")).not.toHaveCount(0);
    await expect(panel.locator("[data-visual-role='elimination'], [data-visual-role='placement']")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
    expect(await boardSignature(page)).toEqual(before);

    await panel.getByRole("button", { name: "Next clue", exact: true }).click();
    await expect(panel).toHaveAttribute("data-hint-stage", "4");
    await expect(panel.getByTestId("hint-stage-message")).toHaveText(coaching.exactExplanation);
    await expect(panel.locator("[data-visual-stage='4']")).toBeVisible();
    await expect(panel.locator("[data-visual-role='evidence']")).not.toHaveCount(0);
    const whyDisclosure = panel.locator(".why-disclosure");
    await expect(whyDisclosure.getByText("Why this works", { exact: true })).toBeVisible();
    await expect(whyDisclosure.locator("p")).toBeHidden();
    if (relationshipTechniques.has(technique)) await expect(whyDisclosure.locator(".relationship-text")).toBeHidden();
    await whyDisclosure.locator("summary").click();
    await expect(whyDisclosure.locator("p")).toBeVisible();
    if (relationshipTechniques.has(technique)) await expect(whyDisclosure.locator(".relationship-text")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
    if (fixture.move.eliminations.length) await expect(panel.locator("[data-visual-role='elimination']")).not.toHaveCount(0);
    if (fixture.move.fills.length) await expect(panel.locator("[data-visual-role='placement']")).not.toHaveCount(0);
    if (relationshipTechniques.has(technique)) await expect(panel.locator("[data-relationship]")).not.toHaveCount(0);
    expect(await boardSignature(page)).toEqual(before);
    await assertNoHorizontalOverflow(page, panel);

    await panel.getByRole("button", { name: "Apply", exact: true }).click();
    const after = await boardSignature(page);
    expect(after).not.toEqual(before);
    await assertExpectedAction(page, fixture.move);
    await page.locator("[data-action='undo']").click();
    expect(await boardSignature(page)).toEqual(before);
  });
}

test("coaching stage remains understandable after a viewport rotation", async ({ page }) => {
  const fixture = fixtures["Hidden Pair"];
  await installFixture(page, fixture);
  await page.goto("/");
  await page.getByTestId("hint-button").click();
  await page.getByRole("button", { name: "Next clue", exact: true }).click();
  await page.getByRole("button", { name: "Next clue", exact: true }).click();
  await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-hint-stage", "3");

  await page.setViewportSize({ width: 740, height: 360 });
  await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-hint-stage", "3");
  await expect(page.locator("[data-visual-stage='3']")).toBeVisible();
  await assertNoHorizontalOverflow(page, page.getByTestId("hint-panel"));
});

async function installFixture(page, fixture) {
  const puzzle = {
    values: fixture.puzzle.values,
    givens: fixture.puzzle.givens,
    notes: fixture.puzzle.notes.map((notes) => [...notes]),
    eliminated: fixture.puzzle.eliminated.map((digits) => [...digits]),
    solution: fixture.puzzle.solution,
    history: []
  };
  await page.addInitScript(({ storedPuzzle, technique }) => {
    window.localStorage.setItem("sudoku-pilot-state-v1", JSON.stringify({
      puzzle: storedPuzzle,
      difficulty: "extreme",
      techniqueDefaultsVersion: 2,
      allowedTechniques: [technique],
      selected: null,
      numberMode: "value"
    }));
  }, { storedPuzzle: puzzle, technique: fixture.technique });
}

async function boardSignature(page) {
  return page.locator("[data-cell]").evaluateAll((cells) => cells.map((cell) => ({
    value: cell.querySelector(".value")?.textContent || "",
    notes: [...cell.querySelectorAll(".notes .on")].map((note) => note.textContent.trim()).sort()
  })));
}

async function assertExpectedAction(page, move) {
  for (const fill of move.fills) await expect(page.getByTestId(`cell-${fill.index}`).locator(".value")).toHaveText(String(fill.digit));
  for (const elimination of move.eliminations) {
    const notes = await page.getByTestId(`cell-${elimination.index}`).locator(".notes .on").allTextContents();
    expect(notes.map((value) => value.trim())).not.toContain(String(elimination.digit));
  }
}

async function assertNoHorizontalOverflow(page, locator) {
  const overflow = await locator.evaluate((element) => ({
    panel: element.scrollWidth - element.clientWidth,
    page: document.documentElement.scrollWidth - window.innerWidth
  }));
  expect(overflow.panel).toBeLessThanOrEqual(1);
  expect(overflow.page).toBeLessThanOrEqual(1);
}
