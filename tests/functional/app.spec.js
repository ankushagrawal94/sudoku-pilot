import { expect, test } from "@playwright/test";
import { ratePuzzle } from "../../src/difficulty.js";
import { TECHNIQUE_LEVELS } from "../../src/puzzles.js";

const KNOWN_GRID = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const GRID_WITH_ONE_THREE_LEFT = "504678912672195348198342567859761423426853791713924856961537284287419635345286179";
const NEARLY_SOLVED_GRID = "534678912672195348198342567859761423426853791713924856961537284287419635345286170";
const SOLVED_GRID = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const GRID_WITH_MISSING_THREE_AND_FIVE = "004678912672195348198342567859761423426853791713924856961537284287419635345286179";

async function importGrid(page, grid = KNOWN_GRID) {
  await openImport(page, "manual");
  await page.evaluate((puzzle) => {
    const inputs = [...document.querySelectorAll("[data-import-cell]")];
    inputs.forEach((input, index) => {
      input.value = puzzle[index] === "0" ? "" : puzzle[index];
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }, grid);
  await page.locator("[data-action='apply-import']").click();
}

async function openImport(page, mode) {
  if (!await page.getByTestId("import-view").count()) {
    await page.getByRole("button", { name: "Import", exact: true }).click();
  }
  const modeButton = page.locator(`[data-import-mode='${mode}']`);
  if (await modeButton.count()) await modeButton.click();
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
  await page.getByRole("button", { name: "Close", exact: true }).click();
}

async function clearTechniques(page) {
  await openMore(page);
  await page.evaluate(() => {
    document.querySelectorAll("[data-technique]").forEach((input) => {
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
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

test("puts a save offline button at the bottom of the homepage", async ({ page }) => {
  await page.goto("/");

  const saveOffline = page.getByRole("button", { name: "Save offline", exact: true });
  await expect(saveOffline).toBeVisible();
  await expect(saveOffline).toHaveAttribute("data-testid", "save-offline");
  await expect.poll(() => saveOffline.evaluate((button) => button.closest(".shell")?.lastElementChild?.contains(button))).toBe(true);
});

test("save offline opens install instructions on iPhone", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1"
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Save offline", exact: true }).click();
  await expect(page.getByTestId("install-prompt").getByRole("heading", { name: "Play offline from your Home Screen" })).toBeVisible();
});

test("save offline links desktop browsers to the setup guide", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Save offline", exact: true }).click();
  await expect(page).toHaveURL(/\/offline-sudoku-app\/$/);
});

test("renders starting digits black and player-entered digits blue", async ({ page }) => {
  await page.goto("/");

  const startingDigit = page.locator(".cell.given .value").first();
  await expect(startingDigit).toHaveCSS("color", "rgb(0, 0, 0)");

  const emptyCell = page.locator(".cell:not(.given)").first();
  await emptyCell.click();
  await page.locator("[data-digit='1']").click();
  await expect(emptyCell.locator(".value")).toHaveCSS("color", "rgb(63, 124, 196)");
});

test("entering the same digit twice only creates one undo step", async ({ page }) => {
  await page.goto("/");

  const emptyCell = page.locator(".cell:not(.given)").first();
  await emptyCell.click();
  await page.locator("[data-digit='1']").click();
  await page.locator("[data-digit='1']").click();
  await expect(emptyCell.locator(".value")).toHaveText("1");

  await page.locator("[data-action='undo']").click();
  await expect(emptyCell.locator(".value")).toHaveCount(0);
});

test("tap controls disable double-tap zoom while preserving page zoom", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("cell-0")).toHaveCSS("touch-action", "manipulation");
  await expect(page.locator("[data-digit='1']")).toHaveCSS("touch-action", "manipulation");
  await expect(page.locator("html")).not.toHaveCSS("touch-action", "none");
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
  await expect(page.getByTestId("hint-panel")).toHaveCount(0);

  await page.locator("[data-action='undo']").click();
  await expect(page.locator(".notes .on")).toHaveCount(0);
});

test("mobile pencil notes stay clear of thick block dividers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  await importGrid(page);
  await page.locator("[data-action='fill-notes']").click();

  const spacing = await page.getByTestId("cell-21").evaluate((cell) => {
    const note = cell.querySelector(".notes i:nth-child(8)");
    const text = document.createRange();
    text.selectNodeContents(note);
    const cellBox = cell.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    const borderBottom = Number.parseFloat(getComputedStyle(cell).borderBottomWidth);
    return cellBox.bottom - borderBottom - textBox.bottom;
  });

  expect(spacing).toBeGreaterThanOrEqual(1.5);
});

test("primary navigation has a stable order and follows browser history", async ({ page }) => {
  await page.goto("/");

  const primaryNav = page.getByRole("navigation", { name: "Sudoku Pilot sections" });
  await expect(primaryNav.getByRole("button")).toHaveText(["Play", "Learn", "Practice", "Import"]);

  await primaryNav.getByRole("button", { name: "Learn", exact: true }).click();
  await expect(page).toHaveURL(/\?view=learn$/);
  await primaryNav.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page).toHaveURL(/\?view=practice$/);
  await primaryNav.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\?view=import$/);
  await expect(page.getByTestId("import-view")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("practice-browser")).toBeVisible();
  await expect(primaryNav.getByRole("button", { name: "Practice", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page.getByTestId("lesson-browser")).toBeVisible();
  await expect(primaryNav.getByRole("button", { name: "Learn", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(page.getByTestId("practice-browser")).toBeVisible();
});

test("direct import routes offer distinct screenshot and manual paths", async ({ page }) => {
  await page.goto("/?view=import");

  const importView = page.getByTestId("import-view");
  await expect(importView).toBeVisible();
  await expect(page.getByTestId("board")).toHaveCount(0);
  await expect(importView.getByRole("button", { name: "Upload screenshot", exact: true })).toHaveAttribute("data-import-mode", "screenshot");
  await expect(importView.getByRole("button", { name: "Enter manually", exact: true })).toHaveAttribute("data-import-mode", "manual");

  await importView.getByRole("button", { name: "Upload screenshot", exact: true }).click();
  await expect(page.locator("[data-import-file]")).toBeVisible();
  await expect(page.locator("[data-action='ocr-import']")).toBeVisible();

  await importView.getByRole("button", { name: "Enter manually", exact: true }).click();
  await expect(page.locator("[data-import-cell]")).toHaveCount(81);
  await expect(page.locator("[data-action='apply-import']")).toHaveText("Start puzzle");
});

test("direct query routes open each requested view", async ({ page }) => {
  await page.goto("/?view=learn");
  await expect(page.getByTestId("lesson-browser")).toBeVisible();
  await expect(page.getByRole("button", { name: "Learn", exact: true })).toHaveAttribute("aria-current", "page");

  await page.goto("/?view=practice");
  await expect(page.getByTestId("practice-browser")).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice", exact: true })).toHaveAttribute("aria-current", "page");

  await page.goto("/?view=play&panel=more");
  await expect(page.getByTestId("more-panel")).toBeVisible();
  await expect(page.getByTestId("board")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveAttribute("aria-current", "page");
});

test("manual import supports grid keyboard editing and 81-character paste", async ({ page }) => {
  await page.goto("/?view=import");
  await openImport(page, "manual");

  const first = page.locator("[data-import-cell='0']");
  await first.focus();
  await first.press("5");
  await expect(first).toHaveValue("5");
  await expect(page.locator("[data-import-cell='1']")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-import-cell='10']")).toBeFocused();
  await page.keyboard.press("7");
  await expect(page.locator("[data-import-cell='10']")).toHaveValue("7");
  await expect(page.locator("[data-import-cell='11']")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Delete");
  await expect(page.locator("[data-import-cell='10']")).toHaveValue("");

  await first.focus();
  await first.evaluate((input, grid) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", grid);
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  }, KNOWN_GRID);
  await expect(page.locator("[data-import-cell='0']")).toHaveValue("5");
  await expect(page.locator("[data-import-cell='1']")).toHaveValue("3");
  await expect(page.locator("[data-import-cell='2']")).toHaveValue("");
  await expect(page.locator("[data-import-cell='80']")).toHaveValue("9");
});

test("more is a standalone panel without puzzle or start actions", async ({ page }) => {
  await page.goto("/");
  await openMore(page);

  const morePanel = page.getByTestId("more-panel");
  await expect(page).toHaveURL(/\?view=play&panel=more$/);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("board")).toHaveCount(0);
  await expect(morePanel.getByRole("button", { name: "Close", exact: true })).toHaveClass(/primary/);
  await expect(morePanel.getByRole("button", { name: "Practice selected technique", exact: true })).toHaveCount(0);
  await expect(morePanel.getByRole("heading", { name: "Start", exact: true })).toHaveCount(0);
  await expect(morePanel.getByRole("button", { name: "New generated puzzle", exact: true })).toHaveCount(0);
  await expect(morePanel.getByRole("button", { name: "Import screenshot", exact: true })).toHaveCount(0);
  await expect(morePanel).toContainText("Run every checked technique repeatedly until none of them can move the board forward.");

  const headings = await morePanel.getByRole("heading").allTextContents();
  expect(headings.indexOf("Run techniques")).toBeLessThan(headings.indexOf("Techniques"));

  await page.goBack();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("more-panel")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByTestId("more-panel")).toBeVisible();
  await expect(page.getByTestId("board")).toHaveCount(0);
});

test("finishing a puzzle opens a whimsical celebration with durable stats", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);

  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  const celebration = page.getByTestId("completion-celebration");
  await expect(celebration).toBeVisible();
  await expect(celebration.getByRole("heading", { name: "Puzzle complete!" })).toBeVisible();
  await expect(celebration.getByTestId("completion-time")).toContainText(/\d+:\d{2}/);
  await expect(celebration.getByTestId("completion-moves")).toContainText("1");
  await expect(celebration.getByTestId("completion-total")).toContainText("1");
  await expect(celebration.getByTestId("completion-analysis")).toContainText("without a hint");
  await expect(celebration.locator(".celebration-spark")).toHaveCount(12);

  await celebration.getByRole("button", { name: "Keep admiring" }).click();
  await expect(celebration).toHaveCount(0);
  await expect(page.getByTestId("cell-80")).toBeFocused();
  await page.reload();
  await expect(page.getByTestId("completion-celebration")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("sudoku-pilot-player-stats-v1")).completed)).toBe(1);
});

test("offers iPhone Home Screen instructions after a first completion", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1"
    });
  });
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  const promotion = page.getByTestId("completion-install-promo");
  await expect(promotion).toContainText("Keep Sudoku Pilot one tap away");
  await expect(promotion).toContainText("offline play");
  await promotion.click();

  const prompt = page.getByTestId("install-prompt");
  await expect(prompt.getByRole("heading", { name: "Play offline from your Home Screen" })).toBeVisible();
  await expect(prompt).toContainText("Share");
  await expect(prompt).toContainText("Add to Home Screen");
  await expect(prompt).toContainText("Open as Web App");
  await expect(prompt.locator(".ios-install-step")).toHaveCount(4);
  await expect(prompt.locator(".ios-install-step img")).toHaveCount(4);
  await expect(prompt).toContainText("View More");
  await expect(prompt).not.toContainText("App Store");
  await expect(prompt).not.toContainText("—");
  await prompt.getByRole("button", { name: "Got it" }).click();
  await expect(prompt).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("sudoku-pilot-install-promotion-v1"))).toBe("dismissed");

  await openMore(page);
  await expect(page.getByRole("button", { name: "How to install" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Offline setup guide" })).toBeVisible();
});

test("does not promote installation when already running from the Home Screen", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      userAgent: {
        configurable: true,
        get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1"
      },
      standalone: { configurable: true, get: () => true }
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Save offline", exact: true })).toHaveCount(0);
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  await expect(page.getByTestId("completion-celebration")).toBeVisible();
  await expect(page.getByTestId("completion-install-promo")).toHaveCount(0);
});

test("uses Android's native install flow when the browser makes it available", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138.0 Mobile Safari/537.36"
    });
  });
  await page.goto("/");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: () => { window.__installPromptCalled = true; } },
      userChoice: { value: Promise.resolve({ outcome: "accepted" }) }
    });
    window.dispatchEvent(event);
  });
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  await page.getByTestId("completion-install-promo").click();
  await expect(page.getByTestId("install-prompt")).toContainText("Confirm Install in Chrome");
  await page.getByRole("button", { name: "Install now" }).click();

  await expect.poll(() => page.evaluate(() => window.__installPromptCalled)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("sudoku-pilot-install-promotion-v1"))).toBe("installed");
  await expect(page.getByTestId("install-prompt")).toHaveCount(0);
});

test("completion freezes the timer through dismissal and reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByTestId("preferences-panel").getByText("Show timer").click();
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  const completedAt = await page.getByTestId("completion-time").textContent();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Keep admiring" }).click();

  await expect(page.getByTestId("timer")).toHaveText(completedAt);
  await page.reload();
  await expect(page.getByTestId("timer")).toHaveText(completedAt);
});

test("undo resumes the timer from the frozen completion time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByTestId("preferences-panel").getByText("Show timer").click();
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  const completedAt = await page.getByTestId("completion-time").textContent();
  await page.waitForTimeout(2200);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  await expect(page.getByTestId("timer")).toHaveText(completedAt);
  await expect.poll(() => page.getByTestId("timer").textContent(), { timeout: 2500 }).not.toBe(completedAt);
});

test("importing an already solved grid does not record a completion", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, SOLVED_GRID);

  await expect(page.getByTestId("completion-celebration")).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem("sudoku-pilot-player-stats-v1"))).toBeNull();
});

test("completion dialog blocks board keyboard input", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  await expect(page.getByTestId("completion-celebration")).toBeVisible();
  await page.keyboard.press("8");

  await expect(page.getByTestId("cell-80")).toHaveAttribute("aria-label", /value 9/);
  await expect(page.getByTestId("completion-celebration")).toBeVisible();
});

test("completion dialog moves focus to its primary action", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  await expect(page.getByRole("button", { name: "Fly another puzzle" })).toBeFocused();
});

test("completion dialog traps keyboard focus", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  const primary = page.getByRole("button", { name: "Fly another puzzle" });
  const dismiss = page.getByRole("button", { name: "Keep admiring" });
  await expect(primary).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dismiss).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(primary).toBeFocused();
});

test("Escape dismisses the completion dialog", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("completion-celebration")).toHaveCount(0);
});

test("dismissing the completion dialog restores board focus", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("cell-80")).toBeFocused();
});

test("solving again after undo reopens celebration without double-counting", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  await expect(page.getByTestId("cell-80")).toHaveAttribute("aria-label", /empty/);
  await page.locator("[data-digit='9']").click();

  await expect(page.getByTestId("completion-celebration")).toBeVisible();
  await expect(page.getByTestId("completion-total")).toHaveText("1");
});

test("restoring a previous puzzle restores its timer and stats", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const key = "sudoku-pilot-state-v1";
    const saved = JSON.parse(window.localStorage.getItem(key));
    saved.elapsedBeforeStart = 120;
    saved.puzzleMoveCount = 3;
    saved.hintCount = 2;
    saved.completionRecorded = true;
    window.localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  const emptyCell = page.locator(".cell:not(.given)").first();
  await emptyCell.click();
  await page.locator("[data-digit='1']").click();

  page.once("dialog", (dialog) => dialog.accept());
  await importGrid(page, KNOWN_GRID);
  await page.getByRole("button", { name: "Restore previous puzzle" }).click();

  const restored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("sudoku-pilot-state-v1")));
  expect(restored.elapsedBeforeStart).toBe(120);
  expect(restored.puzzleMoveCount).toBe(4);
  expect(restored.hintCount).toBe(2);
  expect(restored.completionRecorded).toBe(true);
});

test("completion primary action starts a new puzzle without confirmation", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, NEARLY_SOLVED_GRID);
  await page.getByTestId("cell-80").click();
  await page.locator("[data-digit='9']").click();
  const solved = await boardSignature(page);
  let prompted = false;
  page.on("dialog", async (dialog) => {
    prompted = true;
    await dialog.dismiss();
  });

  await page.getByRole("button", { name: "Fly another puzzle" }).click();

  expect(prompted).toBe(false);
  await expect(page.getByTestId("completion-celebration")).toHaveCount(0);
  expect(await boardSignature(page)).not.toEqual(solved);
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

test("action messages do not return after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  await expect(page.getByTestId("run-message")).toContainText("Started a new medium puzzle.");

  await page.reload();

  await expect(page.getByTestId("run-message")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("sudoku-pilot-state-v1")));
  expect(saved).not.toHaveProperty("runMessage");
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
  if (await page.getByTestId("completion-celebration").count()) {
    await page.getByRole("button", { name: "Keep admiring" }).click();
  }

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

  await expect(page.getByTestId("hint-panel")).toHaveCount(0);
  await page.getByTestId("hint-button").click();
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

test("notes switch appears above secondary tools", async ({ page }) => {
  await page.goto("/");

  const notesSwitch = page.getByRole("switch", { name: "Notes", exact: true });
  const multiButton = page.getByRole("button", { name: "Multi", exact: true });
  const [notesBox, multiBox] = await Promise.all([
    notesSwitch.boundingBox(),
    multiButton.boundingBox()
  ]);

  expect(notesBox).not.toBeNull();
  expect(multiBox).not.toBeNull();
  expect(notesBox.y).toBeLessThan(multiBox.y);
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
  const contrast = await three.evaluate((button) => {
    const parse = (color) => color.match(/\d+/g).slice(0, 3).map(Number);
    const luminance = (color) => {
      const channels = parse(color).map((value) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const styles = getComputedStyle(button);
    const lighter = luminance(styles.backgroundColor);
    const darker = luminance(styles.color);
    return (lighter + 0.05) / (darker + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
});

test("number pad does not complete a digit with conflicting placements", async ({ page }) => {
  await page.goto("/");
  await importGrid(page, GRID_WITH_MISSING_THREE_AND_FIVE);

  const three = page.locator("[data-digit='3']");
  await page.getByTestId("cell-0").click();
  await three.click();

  await expect(three).not.toHaveClass(/completed/);
  await expect(three).not.toHaveAttribute("aria-label", "3, completed");
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
  await expect(page.getByText("On: numbers add pencil notes", { exact: true })).toBeVisible();
  await page.locator("[data-digit='4']").click();
  await expect(page.getByTestId("cell-2").locator(".value")).toHaveCount(0);

  await notesSwitch.click();
  await expect(notesSwitch).toHaveAttribute("aria-checked", "false");
  await expect(board).toHaveClass(/value-entry-mode/);
  await expect(page.getByText("Off: numbers fill cells", { exact: true })).toBeVisible();
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
  await expect(entryMode.getByText("Off: numbers fill cells", { exact: true })).toBeVisible();
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

test("multi exposes its toggle state and More opens a closable standalone panel", async ({ page }) => {
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
  await expect(page.getByTestId("board")).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("more-panel")).toHaveCount(0);
  await expect(page.getByTestId("board")).toBeVisible();
});

test("preferences control timer, highlighting, and input order", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  const preferences = page.getByTestId("preferences-panel");

  await expect(preferences.getByText("Show mistakes as I play")).toBeVisible();
  await expect(page.getByTestId("timer")).toHaveCount(0);
  await preferences.getByText("Show timer").click();
  await expect(preferences.getByText("Show timer").locator("input")).toBeChecked();

  await preferences.locator("[data-entry-method]").selectOption("digit-first");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("timer")).toBeVisible();
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
  await openImport(page, "screenshot");
  await page.locator("[data-import-file]").setInputFiles({
    name: "valid.png",
    mimeType: "image/png",
    buffer: Buffer.from("valid-image-placeholder")
  });
  await expect(page.locator(".import-preview")).toBeVisible();
  await page.locator("[data-import-cell='0']").fill("9");

  await page.locator("[data-import-file]").setInputFiles({
    name: "puzzle.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")
  });
  await expect(page.getByTestId("import-error")).toContainText("PNG, JPEG, or WebP");
  await expect(page.locator("[data-import-cell='0']")).toHaveValue("9");
  await expect(page.locator(".import-preview")).toHaveCount(0);
  await expect(page.locator("[data-action='ocr-import']")).toBeDisabled();

  await page.locator("[data-import-file]").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1)
  });
  await expect(page.getByTestId("import-error")).toContainText("4 MB or smaller");
  await expect(page.locator("[data-import-cell='0']")).toHaveValue("9");
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
    await page.getByRole("button", { name: "Extreme", exact: true }).click();
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
  await openImport(page, "manual");

  const field = page.locator("[data-import-cell='2']");
  await field.fill("");
  await field.pressSequentially("4");
  await expect(field).toHaveValue("4");
  await expect(page.getByTestId("cell-2").locator(".value")).toHaveCount(0);
});

test("screenshot review can explicitly preserve a singleton pencil note", async ({ page }) => {
  await page.goto("/");
  await openImport(page, "screenshot");

  const field = page.locator("[data-import-cell='0']");
  await field.fill("4");
  await page.getByRole("button", { name: "Pencil notes", exact: true }).click();
  await expect(field).toHaveAttribute("data-import-kind", "notes");
  await expect(page.getByRole("button", { name: "Pencil notes", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.locator("[data-action='apply-import']").click();
  await expect(page.getByTestId("cell-0").locator(".value")).toHaveCount(0);
  await expect(page.getByTestId("cell-0").locator(".notes .on")).toHaveText("4");
});

test("import validates before replacement and allows restoring replaced progress", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-action='fill-notes']").click();
  await openImport(page, "manual");
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

test("uploads raw image bytes to same-origin OCR and preserves detected values and notes for review", async ({ page }) => {
  const cells = Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => {
    if (row === 0 && column === 0) return { kind: "value", value: 5 };
    if (row === 0 && column === 1) return { kind: "notes", notes: [2] };
    if (row === 0 && column === 2) return { kind: "notes", notes: [7, 3, 3] };
    return { kind: "notes", notes: [] };
  }));
  await page.route("**/api/sudoku-ocr", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["content-type"]).toBe("image/png");
    expect(route.request().headers()["x-sudoku-image-name"]).toBeUndefined();
    expect(route.request().postDataBuffer()).toEqual(Buffer.from("raw-image-bytes"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ puzzle: { cells } })
    });
  });
  await page.goto("/");
  await openImport(page, "screenshot");
  await expect(page.locator(".import-disclosure")).toContainText("paid third-party recognition API");
  await expect(page.locator(".import-disclosure")).toContainText("limited shared quota");
  await page.locator("[data-import-cell='80']").fill("9");
  await page.locator("[data-import-file]").setInputFiles({
    name: "puzzle.png", mimeType: "image/png", buffer: Buffer.from("raw-image-bytes")
  });
  await expect(page.locator("[data-import-cell='80']")).toHaveValue("");
  await page.locator("[data-action='ocr-import']").click();
  await expect(page.getByTestId("import-status")).toContainText("Review every detected filled digit and pencil note");
  await expect(page.locator("[data-import-cell='0']")).toHaveValue("5");
  await expect(page.locator("[data-import-cell='0']")).toHaveAttribute("data-import-kind", "value");
  await expect(page.locator("[data-import-cell='1']")).toHaveValue("2");
  await expect(page.locator("[data-import-cell='1']")).toHaveAttribute("data-import-kind", "notes");
  await expect(page.locator("[data-import-cell='2']")).toHaveValue("37");
  await expect(page.locator("[data-import-cell='2']")).toHaveAttribute("data-import-kind", "notes");
  await expect(page.locator("[data-action='ocr-import']")).toBeDisabled();
  await expect(page.locator("[data-action='ocr-import']")).toHaveText("Scan complete");

  await page.locator("[data-import-cell='2']").fill("3");
  await expect(page.locator("[data-import-cell='2']")).toHaveAttribute("data-import-kind", "notes");
  await expect(page.getByRole("button", { name: "Pencil notes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-action='apply-import']").click();
  await expect(page.getByTestId("cell-0").locator(".value")).toHaveText("5");
  await expect(page.getByTestId("cell-1").locator(".notes .on")).toHaveText("2");
  await expect(page.getByTestId("cell-2").locator(".notes .on")).toHaveText("3");
});

test("keeps OCR online-only and aborts an in-progress upload when cancelled or navigated away", async ({ page, context }) => {
  await page.addInitScript(() => {
    const browserFetch = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).includes("/api/sudoku-ocr")) {
        return new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            window.__ocrAbortCount = (window.__ocrAbortCount || 0) + 1;
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      }
      return browserFetch(input, init);
    };
  });
  await page.goto("/");
  await openImport(page, "screenshot");
  await page.locator("[data-import-file]").setInputFiles({
    name: "puzzle.png", mimeType: "image/png", buffer: Buffer.from("not-a-real-image")
  });
  await context.setOffline(true);
  await page.locator("[data-action='ocr-import']").click();
  await expect(page.getByTestId("import-error")).toContainText("requires an internet connection");
  await context.setOffline(false);
  await page.locator("[data-action='ocr-import']").click();
  await expect(page.getByTestId("import-status")).toContainText("Uploading and reading screenshot");
  await page.getByRole("button", { name: "Cancel online scan", exact: true }).click();
  await expect(page.getByTestId("import-status")).toContainText("cancelled");
  await expect.poll(() => page.evaluate(() => window.__ocrAbortCount || 0)).toBe(1);

  await page.locator("[data-import-file]").setInputFiles({
    name: "puzzle.png", mimeType: "image/png", buffer: Buffer.from("not-a-real-image")
  });
  await page.locator("[data-action='ocr-import']").click();
  await expect(page.getByTestId("import-status")).toContainText("Uploading and reading screenshot");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__ocrAbortCount || 0)).toBe(2);
});

test("exposes accessible board state, OCR controls, and data controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cell-0")).toHaveAttribute("aria-pressed", "false");
  await openImport(page, "screenshot");
  await expect(page.locator("[data-action='ocr-import']")).toHaveText("Scan online");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear local data", exact: true })).toBeVisible();
});

test("clear local data resets canonical played-puzzle history", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("sudoku-pilot-played-canonical-v1") || "[]").length)).toBeGreaterThan(0);
  const editable = page.locator(".cell:not(.given)").first();
  await editable.click();
  await page.locator("[data-digit='1']").click();
  await openMore(page);
  await page.getByRole("button", { name: "Clear local data", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("sudoku-pilot-played-canonical-v1"))).toBeNull();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("sudoku-pilot-state-v1")));
  expect(saved.puzzle.values.every((value, index) => saved.puzzle.givens[index] || value === 0)).toBe(true);
  expect(saved.puzzle.notes.every((notes) => notes.length === 0)).toBe(true);
});
