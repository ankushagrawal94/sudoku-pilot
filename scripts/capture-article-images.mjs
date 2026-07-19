import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { buildCanonicalCoachingFixtures } from "../tests/fixtures/coaching-fixtures.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicImages = path.join(root, "public", "images");
const baseURL = process.env.SUDOKU_CAPTURE_URL || "http://127.0.0.1:5174";
const stagingDirectory = await mkdtemp(path.join(tmpdir(), "sudoku-pilot-article-images-"));
const fixture = buildCanonicalCoachingFixtures()["Naked Single"];
const captures = [];
const browser = await chromium.launch({ headless: true });

try {
  await captureHintImages();
  await captureImportImage();

  await mkdir(publicImages, { recursive: true });
  for (const capture of captures) {
    await copyFile(capture.stagedPath, path.join(publicImages, capture.filename));
  }
  console.log(JSON.stringify({ baseURL, captures: captures.map(({ stagedPath: _stagedPath, ...capture }) => capture) }, null, 2));
} finally {
  await browser.close();
  await rm(stagingDirectory, { recursive: true, force: true });
}

async function captureHintImages() {
  const context = await browser.newContext({
    viewport: { width: 1220, height: 1100 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await installFixture(page);
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await waitForFonts(page);
  await page.getByTestId("hint-button").click();

  const panel = page.getByTestId("hint-panel");
  await assertHintStage(panel, 1);
  await captureLocator(panel, "sudoku-pilot-naked-single-first-clue-v3.png", 660);

  for (let stage = 2; stage <= 4; stage += 1) {
    await panel.getByRole("button", { name: "Next clue", exact: true }).click();
    await assertHintStage(panel, stage);
  }
  await captureLocator(panel, "sudoku-pilot-naked-single-exact-move-v3.png", 660);
  await context.close();
}

async function captureImportImage() {
  const context = await browser.newContext({
    viewport: { width: 776, height: 1200 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await waitForFonts(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Import screenshot", exact: true }).click();
  await captureLocator(page.locator(".import-panel"), "sudoku-pilot-import-review-grid-v3.png", 740);
  await context.close();
}

async function installFixture(page) {
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

async function waitForFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.activeElement?.blur();
  });
}

async function assertHintStage(panel, stage) {
  await panel.waitFor({ state: "visible" });
  assert.equal(await panel.getAttribute("data-hint-stage"), String(stage));
}

async function captureLocator(locator, filename, displayWidth) {
  await locator.waitFor({ state: "visible" });
  await locator.evaluate((element) => element.ownerDocument.activeElement?.blur());
  const box = await locator.boundingBox();
  assert.ok(box, `${filename} has no bounding box`);
  assert.ok(Math.abs(box.width - displayWidth) < 0.5, `${filename} is ${box.width}px wide; expected ${displayWidth}px`);

  const stagedPath = path.join(stagingDirectory, filename);
  await locator.screenshot({
    path: stagedPath,
    animations: "disabled",
    caret: "hide",
    scale: "device"
  });
  const { width, height } = pngDimensions(await readFile(stagedPath));
  assert.equal(width, displayWidth * 2, `${filename} must be captured at 2x density`);
  captures.push({ filename, displayWidth, width, height, stagedPath });
}

function pngDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", "capture must be a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
