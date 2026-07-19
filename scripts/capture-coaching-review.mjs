import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { COMMITTED_COACHING_TECHNIQUES } from "../src/puzzles.js";
import { buildCanonicalCoachingFixtures } from "../tests/fixtures/coaching-fixtures.js";

const port = Number(process.env.SUDOKU_REVIEW_PORT || 4181);
const baseURL = `http://127.0.0.1:${port}`;
const outputRoot = path.resolve("output/coaching-review/visual-review");
const fixtures = buildCanonicalCoachingFixtures();
const viewports = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 393, height: 852 }
};
const families = {
  Singles: ["Last Digit", "Naked Single", "Hidden Single"],
  "Locked candidates": ["Pointing Candidates", "Claiming Candidates"],
  Subsets: ["Naked Pair", "Hidden Pair", "Naked Triple", "Hidden Triple", "Naked Quadruple"],
  Fish: ["X-Wing", "Swordfish"],
  "Single-digit links": ["Skyscraper", "2-String Kite"],
  Wings: ["XY-Wing", "XYZ-Wing", "W-Wing"]
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const preview = spawn("npm", ["run", "preview", "--", "--port", String(port)], { stdio: "inherit" });

try {
  await waitForServer();
  const browser = await chromium.launch();
  const manifest = [];
  try {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const directory = path.join(outputRoot, viewportName);
      await mkdir(directory, { recursive: true });
      const context = await browser.newContext({ viewport });
      for (const technique of COMMITTED_COACHING_TECHNIQUES) {
        const fixture = fixtures[technique];
        const page = await context.newPage();
        await installFixture(page, fixture);
        await page.goto(baseURL);
        await page.getByTestId("hint-button").click();
        const slug = technique.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const stages = {};
        for (let stage = 1; stage <= 4; stage += 1) {
          const filename = `${slug}-stage-${stage}.png`;
          await page.getByTestId("hint-panel").screenshot({ path: path.join(directory, filename) });
          stages[`stage${stage}`] = `${viewportName}/${filename}`;
          if (stage < 4) await page.getByRole("button", { name: "Next clue", exact: true }).click();
        }
        manifest.push({ technique, viewport: viewportName, ...stages });
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), viewports, families, artifacts: manifest }, null, 2)}\n`);
  await writeFile(path.join(outputRoot, "index.html"), buildIndex(manifest));
  console.log(`Coaching visual review written to ${outputRoot}`);
} finally {
  preview.kill("SIGTERM");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview did not start at ${baseURL}.`);
}

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
      allowedTechniques: [technique]
    }));
  }, { storedPuzzle: puzzle, technique: fixture.technique });
}

function buildIndex(manifest) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sudoku Pilot progressive coaching visual review</title>
<style>
body{font-family:ui-sans-serif,system-ui;margin:0;background:#f3f6fa;color:#172033}main{max-width:1500px;margin:auto;padding:24px}h1{margin:0 0 8px}p{color:#526173}.family{background:#fff;border:1px solid #dce4ee;border-radius:12px;margin:20px 0;padding:18px}.technique{border-top:1px solid #e5eaf0;padding-top:14px;margin-top:14px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.shot{min-width:0}.shot img{display:block;width:100%;border:1px solid #cbd5e1;border-radius:8px}.shot b{display:block;font-size:12px;margin:0 0 5px;color:#526173}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){main{padding:12px}.grid{grid-template-columns:1fr}}
</style></head><body><main><h1>Progressive coaching visual review</h1>
<p>Draft review packet. Each committed Tier 1 and Tier 2 technique is shown across all four progressive coaching stages for desktop and mobile. Human comparative scores remain intentionally blank.</p>
${Object.entries(families).map(([family, techniques]) => `<section class="family"><h2>${family}</h2>${techniques.map((technique) => {
    const artifacts = manifest.filter((item) => item.technique === technique);
    return `<article class="technique"><h3>${technique}</h3><div class="grid">${artifacts.flatMap((item) => [1, 2, 3, 4].map((stage) => {
      const source = item[`stage${stage}`];
      return `<div class="shot"><b>${item.viewport} · Stage ${stage}</b><a href="${source}"><img src="${source}" alt="${technique} Stage ${stage} at ${item.viewport} size"></a></div>`;
    })).join("")}</div></article>`;
  }).join("")}</section>`).join("")}
</main></body></html>`;
}
