import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { PRACTICE_MODES } from "../src/practice.js";
import { COMMITTED_COACHING_TECHNIQUES } from "../src/puzzles.js";

const port = Number(process.env.SUDOKU_REVIEW_PORT || 4182);
const baseURL = `http://127.0.0.1:${port}`;
const outputRoot = path.resolve("output/learning-practice-review/visual-review");
const viewports = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 393, height: 852 }
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const preview = spawn("npm", ["run", "preview", "--", "--port", String(port)], { stdio: "inherit" });

try {
  await waitForServer();
  const browser = await chromium.launch();
  const artifacts = [];
  try {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const directory = path.join(outputRoot, viewportName);
      await mkdir(directory, { recursive: true });
      const context = await browser.newContext({ viewport });
      for (const technique of COMMITTED_COACHING_TECHNIQUES) {
        const slug = technique.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const item = { technique, viewport: viewportName };

        const lessonPage = await context.newPage();
        await lessonPage.goto(baseURL);
        await lessonPage.getByRole("button", { name: "Learn", exact: true }).click();
        await lessonPage.locator("[data-lesson-select]").selectOption(technique);
        for (let stage = 2; stage <= 4; stage += 1) await lessonPage.getByRole("button", { name: "Next stage", exact: true }).click();
        await lessonPage.evaluate(() => window.scrollTo(0, 0));
        const lessonFile = `${slug}-lesson.png`;
        await lessonPage.locator(".lesson-content").screenshot({ path: path.join(directory, lessonFile), animations: "disabled" });
        item.lesson = `${viewportName}/${lessonFile}`;
        await lessonPage.close();

        for (const mode of PRACTICE_MODES) {
          const page = await context.newPage();
          await page.goto(baseURL);
          await page.getByRole("button", { name: "Practice", exact: true }).click();
          await page.locator("[data-practice-technique]").selectOption(technique);
          await page.getByRole("tab", { name: mode.label, exact: true }).click();
          await page.getByRole("button", { name: `Start ${mode.label}`, exact: true }).click();
          if (mode.id === "near-miss") {
            await page.getByRole("button", { name: "Yes, it is valid", exact: true }).click();
          } else {
            await page.getByTestId("hint-button").click();
            for (let stage = 2; stage <= 4; stage += 1) await page.getByTestId("hint-panel").getByRole("button", { name: "Next clue", exact: true }).click();
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          const filename = `${slug}-${mode.id}.png`;
          await page.getByTestId("practice-session").screenshot({ path: path.join(directory, filename), animations: "disabled" });
          item[mode.id] = `${viewportName}/${filename}`;
          await page.close();
        }
        artifacts.push(item);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), viewports, techniques: COMMITTED_COACHING_TECHNIQUES, modes: PRACTICE_MODES, artifacts }, null, 2)}\n`);
  await writeFile(path.join(outputRoot, "index.html"), buildIndex(artifacts));
  console.log(`Learning and practice visual review written to ${outputRoot}`);
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

function buildIndex(artifacts) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sudoku Pilot learning and practice visual review</title>
<style>body{font-family:ui-sans-serif,system-ui;margin:0;background:#f3f6fa;color:#172033}main{max-width:1600px;margin:auto;padding:24px}p{color:#526173}.technique{background:#fff;border:1px solid #dce4ee;border-radius:12px;margin:20px 0;padding:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.shot{min-width:0}.shot img{display:block;width:100%;border:1px solid #cbd5e1;border-radius:8px}.shot b{display:block;font-size:12px;margin:0 0 5px;color:#526173}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){main{padding:12px}.grid{grid-template-columns:1fr}}</style></head><body><main><h1>Learning and practice visual review</h1><p>Review packet for every committed technique: the complete lesson and all three verified practice modes at desktop and mobile viewports. Comparative scores remain for a human reviewer.</p>
${COMMITTED_COACHING_TECHNIQUES.map((technique) => `<section class="technique"><h2>${technique}</h2>${["desktop", "mobile"].map((viewport) => { const item = artifacts.find((artifact) => artifact.technique === technique && artifact.viewport === viewport); return `<h3>${viewport}</h3><div class="grid">${[["Lesson", "lesson"], ...PRACTICE_MODES.map((mode) => [mode.label, mode.id])].map(([label, key]) => `<div class="shot"><b>${label}</b><a href="${item[key]}"><img src="${item[key]}" alt="${technique} ${label} at ${viewport} size"></a></div>`).join("")}</div>`; }).join("")}</section>`).join("")}
</main></body></html>`;
}
