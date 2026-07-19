import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { chromium } from "@playwright/test";
import { createPracticeState, getCertifiedPracticeFixtures, PRACTICE_MODES } from "../src/practice.js";
import { COMMITTED_COACHING_TECHNIQUES } from "../src/puzzles.js";

const port = Number(process.env.SUDOKU_METRICS_PORT || 4183);
const baseURL = `http://127.0.0.1:${port}`;
const outputFile = path.resolve("output/learning-practice-review/practice-metrics.json");
const viewports = {
  desktop: { width: 1280, height: 900, thresholdMs: 2_000 },
  mobile: { width: 393, height: 852, thresholdMs: 3_000 }
};
const reliability = [];

for (const technique of COMMITTED_COACHING_TECHNIQUES) {
  const coldStarted = performance.now();
  getCertifiedPracticeFixtures(technique);
  const coldFixtureBuildMs = performance.now() - coldStarted;
  for (const mode of PRACTICE_MODES) {
    const started = performance.now();
    let successes = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = createPracticeState(technique, mode.id, attempt);
      if (state.technique === technique && state.mode === mode.id && state.certification.targetAvailable) successes += 1;
    }
    reliability.push({ technique, mode: mode.id, attempts: 100, successes, coldFixtureBuildMs, hundredStartsMs: performance.now() - started });
    assert.ok(successes >= 99, `${technique} ${mode.label} missed the 99/100 reliability threshold.`);
  }
}

const preview = spawn("npm", ["run", "preview", "--", "--port", String(port)], { stdio: "inherit" });
const browserTiming = [];
try {
  await waitForServer();
  const browser = await chromium.launch();
  try {
    for (const [viewportName, settings] of Object.entries(viewports)) {
      const context = await browser.newContext({ viewport: settings });
      for (const technique of COMMITTED_COACHING_TECHNIQUES) {
        const page = await context.newPage();
        await page.goto(baseURL);
        await page.getByRole("button", { name: "Practice", exact: true }).click();
        await page.locator("[data-practice-technique]").selectOption(technique);
        for (const mode of PRACTICE_MODES) {
          await page.getByRole("tab", { name: mode.label, exact: true }).click();
          const started = performance.now();
          await page.getByRole("button", { name: `Start ${mode.label}`, exact: true }).click();
          await page.getByTestId("practice-session").waitFor({ state: "visible" });
          const startupMs = performance.now() - started;
          assert.ok(startupMs < settings.thresholdMs, `${technique} ${mode.label} ${viewportName} startup ${startupMs.toFixed(1)}ms exceeded ${settings.thresholdMs}ms.`);
          browserTiming.push({ technique, mode: mode.id, viewport: viewportName, startupMs, thresholdMs: settings.thresholdMs });
        }
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  preview.kill("SIGTERM");
}

const report = {
  generatedAt: new Date().toISOString(),
  strategyCount: reliability.length,
  totalAttempts: reliability.reduce((sum, item) => sum + item.attempts, 0),
  totalSuccesses: reliability.reduce((sum, item) => sum + item.successes, 0),
  thresholds: { reliability: "at least 99 of 100", desktopMs: 2_000, mobileMs: 3_000 },
  summary: {
    slowestColdFixtureBuild: maxBy(reliability, "coldFixtureBuildMs"),
    slowestHundredStarts: maxBy(reliability, "hundredStartsMs"),
    slowestDesktop: maxBy(browserTiming.filter(({ viewport }) => viewport === "desktop"), "startupMs"),
    slowestMobile: maxBy(browserTiming.filter(({ viewport }) => viewport === "mobile"), "startupMs")
  },
  reliability,
  browserTiming
};
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Practice metrics written to ${outputFile}: ${report.totalSuccesses}/${report.totalAttempts} starts succeeded.`);

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

function maxBy(items, field) {
  return items.reduce((maximum, item) => item[field] > maximum[field] ? item : maximum, items[0]);
}
