import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [vercelConfig, appSource, browserAnalyticsSource, envExample, gitignore, readme, sudokuOcrClient] = await Promise.all([
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/browserAnalytics.js", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
  readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../server/sudoku-ocr-client.js", import.meta.url), "utf8")
]);
const vercel = JSON.parse(vercelConfig);
const packageConfig = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const headers = Object.fromEntries(vercel.headers?.[0]?.headers?.map(({ key, value }) => [key.toLowerCase(), value]) || []);

assert.match(headers["content-security-policy"] || "", /default-src 'self'/);
assert.match(headers["content-security-policy"] || "", /script-src 'self'/);
assert.match(headers["content-security-policy"] || "", /style-src 'self' 'unsafe-inline'/, "PostHog popup and widget surveys require their bundled inline styles.");
assert.match(headers["content-security-policy"] || "", /connect-src 'self' https:\/\/us\.i\.posthog\.com https:\/\/eu\.i\.posthog\.com/);
assert.match(headers["content-security-policy"] || "", /frame-ancestors 'none'/);
assert.equal(headers["x-frame-options"], "DENY");
assert.equal(headers["x-content-type-options"], "nosniff");
assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
assert.match(headers["permissions-policy"] || "", /camera=\(\)/);
assert.match(headers["permissions-policy"] || "", /microphone=\(\)/);

assert.doesNotMatch(appSource, /https?:\/\//i, "Application source must not load remote runtime scripts.");
assert.doesNotMatch(appSource, /createElement\(["']script["']\)/, "OCR must not inject a script element.");
assert.match(appSource, /ALLOWED_IMAGE_TYPES/);
assert.match(appSource, /MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/);
assert.equal(packageConfig.dependencies["tesseract.js"], "5.1.1", "OCR engine must be npm-pinned.");
assert.match(appSource, /import\(["']tesseract\.js["']\)/, "OCR engine must be dynamically imported.");
assert.match(appSource, /langPath: "\/ocr"/, "OCR language data must be served from this origin.");
assert.match(appSource, /workerPath:/, "OCR worker must be an app-controlled asset.");
assert.doesNotMatch(appSource, /cdn\.|jsdelivr|unpkg/i, "OCR must not reference third-party CDNs.");
assert.match(envExample, /^VITE_POSTHOG_KEY=\s*$/m);
assert.match(envExample, /^VITE_POSTHOG_HOST=https:\/\/us\.i\.posthog\.com$/m);
assert.match(envExample, /^RAPIDAPI_KEY=\s*$/m);
assert.match(gitignore, /^\.env\.\*$/m);
assert.match(gitignore, /^!\.env\.example$/m);
assert.match(readme, /VITE_POSTHOG_KEY/);
assert.match(readme, /VITE_POSTHOG_HOST/);
assert.doesNotMatch(browserAnalyticsSource, /phc_[A-Za-z0-9]/, "Production source must not embed a PostHog project key.");
assert.match(browserAnalyticsSource, /posthog-js\/dist\/module\.full\.no-external\.js/, "The bundled full SDK must include replay, surveys, and other optional product modules.");
assert.doesNotMatch(appSource, /board-frame analytics-block/, "Session replay should include puzzle interactions.");
assert.match(appSource, /import-panel analytics-image-block/, "Session replay must continue excluding the imported image itself.");
assert.doesNotMatch(packageConfig.scripts.test, /sudoku-ocr-live/, "The quota-consuming live OCR check must not run in the default test suite.");
assert.doesNotMatch(sudokuOcrClient, /VITE_RAPIDAPI_KEY/, "The RapidAPI key must remain server-only.");
assert.match(sudokuOcrClient, /event: "sudoku_ocr_provider_call"/, "Every provider call must emit a countable usage event.");
assert.match(sudokuOcrClient, /retry: false/, "The OCR provider client must not silently spend quota on retries.");

console.log("security configuration tests passed");
