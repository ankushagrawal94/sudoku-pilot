import { expect, test } from "@playwright/test";
import { ratePuzzle } from "../../src/difficulty.js";
import { TECHNIQUE_LEVELS } from "../../src/puzzles.js";

const KNOWN_GRID = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const GRID_WITH_ONE_THREE_LEFT = "504678912672195348198342567859761423426853791713924856961537284287419635345286179";

async function importGrid(page, grid = KNOWN_GRID) {
  await openMore(page);
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();
  await page.evaluate((puzzle) => {
    const inputs = [...document.querySelectorAll("[data-import-cell]")];
    inputs.forEach((input, index) => {
      input.value = puzzle[index] === "0" ? "" : puzzle[index];
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }, grid);
  await page.locator("[data-action='apply-import']").click();
}

async function openMore(page) {
  if (await page.getByTestId("more-panel").count()) return;
  await page.getByRole("button", { name: "More", exact: true }).click();
}

async function setOnlyTechnique(page, technique) {
  await page.evaluate((selected) => {
    document.querySelectorAll("[data-technique]").forEach((input) => {
      input.checked = input.dataset.technique === selected;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }, technique);
}

async function clearTechniques(page) {
  await openMore(page);
  await page.evaluate(() => {
    document.querySelectorAll("[data-technique]").forEach((input) => {
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

async function boardSignature(page) {
  return page.locator(".cell.given .value").evaluateAll((values) => values.map((value) => value.textContent).join(""));
}

test("loads without a selected cell, prefilled notes, or visible spoilers", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("board").locator("[data-cell]")).toHaveCount(81);
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(page.locator(".notes .on")).toHaveCount(0);
  await expect(page.getByTestId("hint-panel")).toHaveCount(0);
  await expect(page.locator(".import-panel")).toHaveCount(0);
  await expect(page.getByTestId("more-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Extreme", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("heading", { name: "sudoku pilot" })).toBeVisible();
  await expect(page.locator(".app-header")).not.toContainText(/available moves?|In progress|Solved/);
});

test("hint starts as coaching and suggests notes before showing exact moves", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("hint-button").click();

  await expect(page.getByTestId("hint-panel")).toContainText("missing pencil notes");
  await expect(page.getByTestId("hint-panel")).not.toContainText("All possible moves");
});

test("hint button toggles the hint panel closed", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("hint-button").click();
  await expect(page.getByTestId("hint-panel")).toBeVisible();

  await page.getByTestId("hint-button").click();
  await expect(page.getByTestId("hint-panel")).toHaveCount(0);
});

test("fill notes is undoable", async ({ page }) => {
  await page.goto("/");

  await page.locator("[data-action='fill-notes']").click();
  await expect(page.locator(".notes .on")).not.toHaveCount(0);

  await page.locator("[data-action='undo']").click();
  await expect(page.locator(".notes .on")).toHaveCount(0);
});

test("new puzzle generates a different board", async ({ page }) => {
  await page.goto("/");

  await openMore(page);
  const before = await boardSignature(page);
  await page.getByTestId("new-puzzle").click();
  const after = await boardSignature(page);

  expect(after).not.toEqual(before);
});

test("difficulty tabs start a new puzzle immediately", async ({ page }) => {
  await page.goto("/");

  const before = await boardSignature(page);
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  const after = await boardSignature(page);

  expect(after).not.toEqual(before);
  await expect(page.getByRole("button", { name: "Medium", exact: true })).toHaveClass(/active/);
  await expect(page.getByTestId("run-message")).toContainText("Started a new medium puzzle.");
});

test("difficulty tabs ask before replacing a puzzle with progress", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-action='fill-notes']").click();
  const before = await boardSignature(page);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Start a new puzzle");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  expect(await boardSignature(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "Extreme", exact: true })).toHaveClass(/active/);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Start a new puzzle");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  expect(await boardSignature(page)).not.toEqual(before);
  await expect(page.getByRole("button", { name: "Hard", exact: true })).toHaveClass(/active/);
});

test("techniques can be run directly or as a selected set", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);
  await page.locator("[data-action='fill-notes']").click();
  await openMore(page);

  await page.locator("[data-run-technique='Naked Single']").click();
  await expect(page.getByTestId("run-message")).toContainText("Naked Single");

  page.once("dialog", (dialog) => dialog.accept());
  await importGrid(page);
  await page.locator("[data-action='fill-notes']").click();
  await openMore(page);
  await page.getByTestId("run-selected").click();
  await expect(page.getByTestId("run-message")).toContainText("Applied");
});

test("all possible moves stay hidden until requested", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-action='fill-notes']").click();

  await expect(page.getByTestId("hint-panel")).not.toContainText("All possible moves");
  await page.getByRole("button", { name: "All moves", exact: true }).click();

  await expect(page.getByTestId("hint-panel")).toContainText("All possible moves");

  await page.getByTestId("hint-button").click();
  await expect(page.getByTestId("hint-panel")).toHaveCount(0);
});

test("advanced shortcut includes the basic techniques too", async ({ page }) => {
  await page.goto("/");
  await openMore(page);

  await page.locator("[data-action='select-advanced']").click();

  await expect(page.locator("[data-technique='Naked Single']")).toBeChecked();
  await expect(page.locator("[data-technique='Hidden Pair']")).toBeChecked();
  await expect(page.locator("[data-technique='X-Wing']")).toBeChecked();
});

test("an explicit empty technique filter offers inline recovery actions", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-action='fill-notes']").click();
  await clearTechniques(page);
  await page.getByTestId("hint-button").click();

  const hintPanel = page.getByTestId("hint-panel");
  await expect(hintPanel).toContainText("current technique filter");
  await expect(hintPanel.getByRole("button", { name: "Fill all notes", exact: true })).toBeVisible();
  await expect(hintPanel.getByRole("button", { name: "Search all techniques", exact: true })).toBeVisible();
  await expect(hintPanel.getByRole("button", { name: "Change technique filter", exact: true })).toBeVisible();

  await hintPanel.getByRole("button", { name: "Change technique filter", exact: true }).click();
  await expect(page.getByTestId("more-panel")).toBeVisible();
});

test("empty hint state can enable all techniques in place", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-action='fill-notes']").click();
  await clearTechniques(page);
  await page.getByTestId("hint-button").click();
  await page.getByRole("button", { name: "Search all techniques", exact: true }).click();

  await expect(page.getByTestId("run-message")).toContainText("search all techniques");
  await expect(page.getByTestId("hint-panel")).not.toContainText("current technique filter");
});

test("existing players migrate to the all-techniques hint default", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const key = "sudoku-pilot-state-v1";
    const saved = JSON.parse(window.localStorage.getItem(key));
    saved.allowedTechniques = [];
    delete saved.techniqueDefaultsVersion;
    window.localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await openMore(page);

  const techniqueFilters = page.locator("[data-technique]");
  await expect(techniqueFilters).not.toHaveCount(0);
  expect(await techniqueFilters.count()).toEqual(await techniqueFilters.evaluateAll((inputs) => inputs.filter((input) => input.checked).length));
});

test("practice hint scoping does not change normal hint defaults", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start Find the pattern", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await openMore(page);

  const techniqueFilters = page.locator("[data-technique]");
  expect(await techniqueFilters.count()).toEqual(await techniqueFilters.evaluateAll((inputs) => inputs.filter((input) => input.checked).length));
});

test("note mode toggles pencil notes without filling a value", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("cell-2").click();
  await page.getByRole("switch", { name: "Notes", exact: true }).click();
  await page.locator("[data-digit='4']").click();

  await expect(page.getByTestId("cell-2").locator(".value")).toHaveCount(0);
  await expect(page.getByTestId("cell-2").locator(".notes .on")).toContainText("4");
});

test("number pad grays out a digit after all nine are placed", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, GRID_WITH_ONE_THREE_LEFT);

  const three = page.locator("[data-digit='3']");
  await expect(three).not.toHaveClass(/completed/);

  await page.getByTestId("cell-1").click();
  await three.click();

  await expect(three).toHaveClass(/completed/);
  await expect(three).toHaveAttribute("aria-label", "3, completed");
  await expect(three).toHaveCSS("color", "rgb(154, 164, 175)");
});

test("note mode allows mistaken pencil notes", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("cell-2").click();
  await page.getByRole("switch", { name: "Notes", exact: true }).click();
  await page.locator("[data-digit='5']").click();

  await expect(page.getByTestId("cell-2").locator(".value")).toHaveCount(0);
  await expect(page.getByTestId("cell-2").locator(".notes .on")).toContainText("5");
});

test("notes switch changes number entry between notes and values", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("cell-2").click();
  const board = page.getByTestId("board");
  const notesSwitch = page.getByRole("switch", { name: "Notes", exact: true });
  await expect(board).toHaveClass(/value-entry-mode/);
  await notesSwitch.click();
  await expect(notesSwitch).toHaveAttribute("aria-checked", "true");
  await expect(board).toHaveClass(/note-entry-mode/);
  await expect(page.getByText("On — numbers add pencil notes", { exact: true })).toBeVisible();
  await page.locator("[data-digit='4']").click();
  await expect(page.getByTestId("cell-2").locator(".value")).toHaveCount(0);

  await notesSwitch.click();
  await expect(notesSwitch).toHaveAttribute("aria-checked", "false");
  await expect(board).toHaveClass(/value-entry-mode/);
  await expect(page.getByText("Off — numbers fill cells", { exact: true })).toBeVisible();
  await page.locator("[data-digit='4']").click();
  await expect(page.getByTestId("cell-2").locator(".value")).toContainText("4");
});

test("placing a value removes matching notes from every row, column, and box peer", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);
  await page.locator("[data-action='fill-notes']").click();

  await page.getByTestId("cell-2").click();
  await page.locator("[data-digit='4']").click();

  const peerNotes = await page.locator("[data-cell]").evaluateAll((cells, selectedIndex) => {
    const selectedRow = Math.floor(selectedIndex / 9);
    const selectedColumn = selectedIndex % 9;
    const selectedBoxRow = Math.floor(selectedRow / 3);
    const selectedBoxColumn = Math.floor(selectedColumn / 3);
    return cells.flatMap((cell) => {
      const index = Number(cell.dataset.cell);
      const row = Math.floor(index / 9);
      const column = index % 9;
      const isPeer = row === selectedRow
        || column === selectedColumn
        || (Math.floor(row / 3) === selectedBoxRow && Math.floor(column / 3) === selectedBoxColumn);
      return isPeer && [...cell.querySelectorAll(".notes .on")].some((note) => note.textContent.trim() === "4") ? [index] : [];
    });
  }, 2);

  expect(peerNotes).toEqual([]);
  await expect(page.getByTestId("cell-15").locator(".notes .on", { hasText: "4" })).toHaveCount(1);
});

test("board cursor follows the entry mode on pointer devices", async ({ page }) => {
  await page.goto("/");

  const hasFinePointer = await page.evaluate(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  test.skip(!hasFinePointer, "Custom cursors only apply to pointer-based devices");

  const cell = page.getByTestId("cell-0");
  await expect(cell).toHaveCSS("cursor", /pen\.svg/);

  await page.getByRole("switch", { name: "Notes", exact: true }).click();
  await expect(cell).toHaveCSS("cursor", /pencil\.svg/);
});

test("notes switch is explicit and separate from puzzle-wide note actions", async ({ page }) => {
  await page.goto("/");

  const entryMode = page.getByRole("group", { name: "Entry mode" });
  const puzzleNotes = page.getByRole("group", { name: "Puzzle notes" });
  const notesSwitch = entryMode.getByRole("switch", { name: "Notes", exact: true });

  await expect(notesSwitch).toHaveAttribute("aria-checked", "false");
  await expect(entryMode.getByText("Off — numbers fill cells", { exact: true })).toBeVisible();
  await expect(puzzleNotes.getByRole("button", { name: "Fill all notes", exact: true })).toBeVisible();
  await expect(puzzleNotes.getByRole("button", { name: "Clear all notes", exact: true })).toBeVisible();
});

test("keyboard note shortcut toggles on and off", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("n");
  await expect(page.getByRole("switch", { name: "Notes", exact: true })).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("n");
  await expect(page.getByRole("switch", { name: "Notes", exact: true })).toHaveAttribute("aria-checked", "false");
});

test("clicking a selected cell again clears same-digit highlights", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("cell-0").click();
  await expect(page.locator(".cell.selected")).toHaveCount(1);
  await expect(page.locator(".cell.same-digit")).not.toHaveCount(0);

  await page.getByTestId("cell-0").click();
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(page.locator(".cell.same-digit")).toHaveCount(0);
});

test("line counts label row and column appearances for the selected digit", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByText("Line counts", { exact: true }).click();
  await expect(page.getByTestId("row-count-0")).toHaveCount(0);

  await page.getByTestId("cell-0").click();
  await expect(page.getByTestId("row-count-0")).toContainText("1");
  await expect(page.getByTestId("col-count-0")).toContainText("1");

  await page.getByText("Line counts", { exact: true }).click();
  await expect(page.getByTestId("row-count-0")).toHaveCount(0);
});

test("multi-select toggles notes across selected cells without filling values", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("multi-select").click();
  await page.getByTestId("cell-2").click();
  await page.getByTestId("cell-3").click();
  await expect(page.locator(".cell.multi-selected")).toHaveCount(2);

  await page.locator("[data-digit='2']").click();
  await expect(page.getByTestId("cell-2").locator(".value")).toHaveCount(0);
  await expect(page.getByTestId("cell-3").locator(".value")).toHaveCount(0);
  await expect(page.getByTestId("cell-2").locator(".notes .on")).toContainText("2");
  await expect(page.getByTestId("cell-3").locator(".notes .on")).toContainText("2");

  await page.locator("[data-digit='2']").click();
  const cell2Notes = await page.getByTestId("cell-2").locator(".notes .on").evaluateAll((notes) => notes.map((note) => note.textContent.trim()));
  const cell3Notes = await page.getByTestId("cell-3").locator(".notes .on").evaluateAll((notes) => notes.map((note) => note.textContent.trim()));
  expect(cell2Notes).not.toContain("2");
  expect(cell3Notes).not.toContain("2");
});

test("multi-select allows user-entered notes even when Sudoku rules disagree", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("multi-select").click();
  await page.getByTestId("cell-2").click();
  await page.getByTestId("cell-3").click();
  await page.locator("[data-digit='5']").click();

  await expect(page.getByTestId("cell-2").locator(".notes .on")).toContainText("5");
  await expect(page.getByTestId("cell-3").locator(".notes .on")).toContainText("5");
});

test("multi and more buttons expose clear toggle states", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("multi-select").click();
  await expect(page.getByTestId("multi-select")).toHaveClass(/active/);
  await expect(page.getByRole("switch", { name: "Notes", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("cell-2").click();
  await expect(page.locator(".cell.multi-selected")).toHaveCount(1);

  await page.getByTestId("multi-select").click();
  await expect(page.getByTestId("multi-select")).not.toHaveClass(/active/);
  await expect(page.getByRole("switch", { name: "Notes", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".cell.multi-selected")).toHaveCount(0);

  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByTestId("more-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "More", exact: true })).toHaveClass(/active/);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByTestId("more-panel")).toHaveCount(0);
});

test("preferences control timer, highlighting, and input order", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  const preferences = page.getByTestId("preferences-panel");

  await expect(preferences.getByText("Show mistakes as I play")).toBeVisible();
  await expect(page.getByTestId("timer")).toHaveCount(0);
  await preferences.getByText("Show timer").click();
  await expect(page.getByTestId("timer")).toBeVisible();

  await preferences.locator("[data-entry-method]").selectOption("digit-first");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("[data-digit='4']").click();
  await expect(page.locator("[data-digit='4']")).toHaveClass(/active/);
  const emptyCell = page.locator(".cell:not(.given)").first();
  await emptyCell.click();
  await expect(emptyCell.locator(".value")).toHaveText("4");

  await page.getByRole("button", { name: "More", exact: true }).click();
  await preferences.getByText("Highlight row, column, and box").click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".cell").first().click();
  await expect(page.locator(".cell.related")).toHaveCount(0);
});

test("clicking a solved cell exits multi-select without leaving notes", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("multi-select").click();
  await page.getByTestId("cell-2").click();
  await expect(page.getByTestId("multi-select")).toHaveClass(/active/);
  await page.getByTestId("cell-0").click();

  await expect(page.getByTestId("multi-select")).not.toHaveClass(/active/);
  await expect(page.locator(".cell.multi-selected")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Notes", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("cell-0")).toHaveClass(/selected/);
});

test("elimination hints apply only after the exact stage and remain undoable", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);
  await page.locator("[data-action='fill-notes']").click();
  await openMore(page);
  await setOnlyTechnique(page, "Pointing Candidates");
  await page.getByTestId("hint-button").click();
  await page.getByRole("button", { name: "Next clue", exact: true }).click();
  await page.getByRole("button", { name: "Next clue", exact: true }).click();
  await page.getByRole("button", { name: "Next clue", exact: true }).click();

  const visualElimination = page.locator("[data-visual-role='elimination']").first();
  const eliminatedDigit = await visualElimination.getAttribute("data-candidate");
  const eliminatedIndex = await visualElimination.evaluate((element) => Number(element.closest("[data-mini-cell]").dataset.miniCell));
  const before = await page.getByTestId(`cell-${eliminatedIndex}`).locator(".notes .on").allTextContents();
  expect(before.map((value) => value.trim())).toContain(eliminatedDigit);

  await page.locator("[data-action='apply-hint']").click();

  const remainingNotes = await page.getByTestId(`cell-${eliminatedIndex}`).locator(".notes .on").evaluateAll((notes) => notes.map((note) => note.textContent.trim()));
  expect(remainingNotes).not.toContain(eliminatedDigit);
  expect(remainingNotes.length).toBeGreaterThan(0);
  await expect(page.getByTestId("hint-panel")).toHaveCount(0);
  await page.getByTestId("hint-button").click();
  await expect(page.getByTestId("hint-panel")).toBeVisible();
  await page.locator("[data-action='undo']").click();
  const restoredNotes = await page.getByTestId(`cell-${eliminatedIndex}`).locator(".notes .on").allTextContents();
  expect(restoredNotes.map((value) => value.trim())).toContain(eliminatedDigit);
});

test("hidden pair follows the standard four-stage disclosure contract", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, "000260701680070090190004500820100040004602900050003028009300074040050036703018000");
  await page.locator("[data-action='fill-notes']").click();
  await openMore(page);
  await setOnlyTechnique(page, "Hidden Pair");
  await page.getByTestId("hint-button").click();

  await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-hint-stage", "1");
  await expect(page.getByTestId("hint-panel")).toContainText("Look for Hidden Pair");
  await expect(page.getByTestId("hint-panel")).not.toContainText(/r\d+c\d+|row \d+|column \d+|block \d+/i);
  await page.getByRole("button", { name: "Next clue", exact: true }).click();
  await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-hint-stage", "2");
  await expect(page.getByTestId("hint-panel")).toContainText(/Start with candidate \d/);
  await page.getByRole("button", { name: "Next clue", exact: true }).click();
  await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-hint-stage", "3");
  await expect(page.locator("[data-visual-stage='3']")).toBeVisible();
  await page.getByRole("button", { name: "Next clue", exact: true }).click();
  await expect(page.getByTestId("hint-panel")).toHaveAttribute("data-hint-stage", "4");
  await expect(page.locator("[data-visual-role='evidence']")).not.toHaveCount(0);
  await expect(page.getByText("Why this works", { exact: true })).toBeVisible();
});

test("about page explains the app and exposes feedback", async ({ page }) => {
  await page.goto("/");
  await openMore(page);

  await page.getByRole("button", { name: "About Sudoku Pilot", exact: true }).click();

  await expect(page.getByTestId("about-panel")).toContainText("practice-first Sudoku trainer");
  await expect(page.getByRole("link", { name: "Email feedback", exact: true })).toHaveAttribute("href", /mailto:/);
  await expect(page.getByTestId("about-panel").getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy/");
  await expect(page.getByTestId("about-panel").getByRole("link", { name: "Source code", exact: true })).toHaveAttribute("href", "/privacy/#source-code");
  await expect(page.getByTestId("about-panel").getByRole("link", { name: "License", exact: true })).toHaveAttribute("href", "/licenses/PolyForm-Noncommercial-1.0.0.txt");
});

test("checker waits until coaching is requested when live mistakes are off", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);

  await page.getByTestId("cell-2").click();
  await page.locator("[data-digit='5']").click();

  await expect(page.getByTestId("check-panel")).toHaveCount(0);
  await page.getByTestId("hint-button").click();
  await expect(page.getByTestId("run-message")).toContainText("Fix the board issue");
});

test("extreme generation requires a positively certified advanced technique", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Extreme", exact: true }).click();
  const grid = await page.locator("[data-cell]").evaluateAll((cells) => cells.map((cell) => (
    cell.classList.contains("given") ? cell.querySelector(".value")?.textContent || "0" : "0"
  )).join(""));
  const rating = ratePuzzle(grid);
  expect({ status: rating.status, level: rating.level }).toEqual({ status: "solved", level: "extreme" });
  expect(TECHNIQUE_LEVELS.extreme.slice(TECHNIQUE_LEVELS.expert.length))
    .toContain(rating.hardestTechnique);
});

test("provides installable PWA metadata", async ({ page }) => {
  await page.goto("/");

  const manifestUrl = await page.locator("link[rel='manifest']").getAttribute("href");
  expect(manifestUrl).toBe("/manifest.webmanifest");
  await expect(page.locator("meta[name='apple-mobile-web-app-capable']")).toHaveAttribute("content", "yes");

  const manifest = await page.request.get(manifestUrl);
  expect(manifest.ok()).toBeTruthy();
  const body = await manifest.json();
  expect(body.display).toBe("standalone");
  expect(body.start_url).toBe("/");
  expect(body.icons.some((icon) => icon.src === "/icons/icon-192.png")).toBeTruthy();
  expect(body.icons.some((icon) => icon.src === "/icons/icon-512.png")).toBeTruthy();
  await expect(page.locator("link[rel='apple-touch-icon']")).toHaveAttribute("href", "/icons/apple-touch-icon.png");
});

test("rejects unsafe and oversized screenshot uploads with a visible error", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  });
  await page.reload();
  await openMore(page);
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();

  await page.locator("[data-import-file]").setInputFiles({
    name: "puzzle.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")
  });
  await expect(page.getByTestId("import-error")).toContainText("PNG, JPEG, WebP, GIF, or BMP");

  await page.locator("[data-import-file]").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
  });
  await expect(page.getByTestId("import-error")).toContainText("5 MB or smaller");
});

test("works offline after first load and preserves progress", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("board").locator("[data-cell]")).toHaveCount(81);

  const boards = [];
  for (let i = 0; i < 3; i += 1) {
    await openMore(page);
    await page.getByTestId("new-puzzle").click();
    boards.push(await page.locator(".cell.given .value").evaluateAll((values) => values.map((value) => value.textContent).join("")));
  }
  expect(new Set(boards).size).toBe(3);

  await page.locator("[data-action='fill-notes']").click();
  const noteCount = await page.locator(".notes .on").count();
  expect(noteCount).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByTestId("board").locator("[data-cell]")).toHaveCount(81);
  await expect(page.locator(".notes .on")).toHaveCount(noteCount);

  await context.setOffline(false);
});

test("migrates saved Sudoku Method progress to the Sudoku Pilot storage key", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-action='fill-notes']").click();
  const noteCount = await page.locator(".notes .on").count();
  expect(noteCount).toBeGreaterThan(0);

  await page.evaluate(() => {
    const current = window.localStorage.getItem("sudoku-pilot-state-v1");
    window.localStorage.setItem("sudoku-method-state-v1", current);
    window.localStorage.removeItem("sudoku-pilot-state-v1");
  });
  await page.reload();

  await expect(page.locator(".notes .on")).toHaveCount(noteCount);
  const keys = await page.evaluate(() => ({
    current: window.localStorage.getItem("sudoku-pilot-state-v1"),
    legacy: window.localStorage.getItem("sudoku-method-state-v1")
  }));
  expect(keys.current).toBeTruthy();
  expect(keys.legacy).toBeNull();
});

test("typing in import fields never triggers board keyboard shortcuts", async ({ page }) => {
  await page.goto("/");
  await importGrid(page);
  await page.getByTestId("cell-2").click();
  await openMore(page);
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();

  const field = page.locator("[data-import-cell='2']");
  await field.fill("");
  await field.pressSequentially("4");
  await expect(field).toHaveValue("4");
  await expect(page.getByTestId("cell-2").locator(".value")).toHaveCount(0);
});

test("import validates before replacement and allows restoring replaced progress", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-action='fill-notes']").click();
  await openMore(page);
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();
  await page.locator("[data-import-cell='0']").fill("5");
  await page.locator("[data-import-cell='1']").fill("5");
  await page.locator("[data-action='apply-import']").click();
  await expect(page.getByTestId("import-status")).toContainText("conflicts");

  await page.locator("[data-import-cell='1']").fill("3");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-action='apply-import']").click();
  await expect(page.getByTestId("run-message")).toContainText("Imported puzzle");
  await page.getByRole("button", { name: "Restore previous puzzle", exact: true }).click();
  await expect(page.locator(".notes .on")).not.toHaveCount(0);
});

test("runs online OCR through a local recognizer seam, parses its result into the review grid, and never injects a remote script", async ({ page }) => {
  await page.addInitScript(() => {
    window.__SUDOKU_OCR_RECOGNIZER__ = {
      recognize: async () => ({ data: { text: "5" } }),
      terminate: async () => {}
    };
    window.Image = class {
      set src(_) { queueMicrotask(() => this.onload()); }
      get naturalWidth() { return 756; }
      get naturalHeight() { return 756; }
    };
    URL.createObjectURL = () => "blob:ocr-fixture";
    URL.revokeObjectURL = () => {};
  });
  await page.goto("/");
  await openMore(page);
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();
  await page.locator("[data-import-file]").setInputFiles({
    name: "puzzle.png", mimeType: "image/png", buffer: Buffer.from("not-a-real-image")
  });
  await page.locator("[data-action='ocr-import']").click();
  await expect(page.getByTestId("import-status")).toContainText("review the detected large digits");
  await expect(page.locator("[data-import-cell='0']")).toHaveValue("5");
  await expect(page.locator("[data-import-cell='80']")).toHaveValue("5");
  expect(await page.locator("script[src^='http']").count()).toBe(0);
});

test("keeps OCR online-only and allows an in-progress OCR request to be cancelled", async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__SUDOKU_OCR_RECOGNIZER__ = {
      recognize: () => new Promise(() => {}),
      terminate: async () => { window.__ocrTerminated = true; }
    };
    window.Image = class {
      set src(_) { queueMicrotask(() => this.onload()); }
      get naturalWidth() { return 756; }
      get naturalHeight() { return 756; }
    };
    URL.createObjectURL = () => "blob:ocr-fixture";
    URL.revokeObjectURL = () => {};
  });
  await page.goto("/");
  await openMore(page);
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();
  await page.locator("[data-import-file]").setInputFiles({
    name: "puzzle.png", mimeType: "image/png", buffer: Buffer.from("not-a-real-image")
  });
  await context.setOffline(true);
  await page.locator("[data-action='ocr-import']").click();
  await expect(page.getByTestId("import-error")).toContainText("requires an internet connection");
  await context.setOffline(false);
  await page.locator("[data-action='ocr-import']").click();
  await expect(page.getByTestId("import-status")).toContainText("Reading screenshot");
  await page.getByRole("button", { name: "Cancel OCR", exact: true }).click();
  await expect(page.getByTestId("import-status")).toContainText("cancelled");
  await expect.poll(() => page.evaluate(() => window.__ocrTerminated)).toBeTruthy();
});

test("exposes accessible board state, OCR controls, and data controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cell-0")).toHaveAttribute("aria-pressed", "false");
  await openMore(page);
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();
  await expect(page.locator("[data-action='ocr-import']")).toHaveText("Try OCR");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear local data", exact: true })).toBeVisible();
});

test("clear local data resets canonical played-puzzle history", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("sudoku-pilot-played-canonical-v1") || "[]").length)).toBeGreaterThan(0);
  await openMore(page);
  await page.getByRole("button", { name: "Clear local data", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("sudoku-pilot-played-canonical-v1"))).toBeNull();
});
