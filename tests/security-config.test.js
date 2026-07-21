import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const [vercelConfig, appSource, browserAnalyticsSource, envExample, gitignore, readme, sudokuOcrClient, sudokuOcrRoute] = await Promise.all([
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/browserAnalytics.js", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
  readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../server/sudoku-ocr-client.js", import.meta.url), "utf8"),
  readFile(new URL("../api/sudoku-ocr.js", import.meta.url), "utf8")
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
assert.match(appSource, /MAX_IMAGE_BYTES = 4 \* 1024 \* 1024/);
assert.match(appSource, /fetch\("\/api\/sudoku-ocr"/, "OCR images must be sent only through the same-origin proxy.");
assert.match(appSource, /body: imageFile/, "The selected image must be sent as raw request bytes.");
assert.match(appSource, /new AbortController\(\)/, "Online OCR requests must be cancellable.");
assert.doesNotMatch(appSource, /import\(["']tesseract\.js["']\)/, "The browser must not run a second local OCR engine.");
assert.doesNotMatch(appSource, /\/ocr\//, "The browser must not reference legacy local OCR assets.");
assert.doesNotMatch(appSource, /cdn\.|jsdelivr|unpkg/i, "OCR must not reference third-party CDNs.");
assert.equal(packageConfig.dependencies["tesseract.js"], undefined, "The replaced browser OCR engine must not remain a production dependency.");
assert.equal(packageConfig.dependencies["@tesseract.js-data/eng"], undefined, "Legacy browser OCR language data must not remain a production dependency.");
for (const asset of ["eng.traineddata.gz", "tesseract-core.wasm", "tesseract-core.wasm.js", "worker.min.js"]) {
  await assert.rejects(
    access(new URL(`../public/ocr/${asset}`, import.meta.url)),
    { code: "ENOENT" },
    `Legacy browser OCR asset must stay removed: public/ocr/${asset}`
  );
}
assert.match(envExample, /^VITE_POSTHOG_KEY=\s*$/m);
assert.match(envExample, /^VITE_POSTHOG_HOST=https:\/\/us\.i\.posthog\.com$/m);
assert.match(envExample, /^RAPIDAPI_KEY=\s*$/m);
assert.match(envExample, /^SUDOKU_OCR_ENABLED=false$/m);
assert.match(envExample, /^SUDOKU_OCR_MAX_CALLS_PER_IP_PER_HOUR=3$/m);
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
assert.match(sudokuOcrRoute, /hasExpectedImageSignature/, "The OCR proxy must validate image signatures before spending provider quota.");
assert.match(sudokuOcrRoute, /SUDOKU_OCR_ENABLED/, "The OCR proxy must have an operator kill switch.");
assert.match(sudokuOcrRoute, /takeClientQuota/, "The OCR proxy must throttle repeated calls before spending provider quota.");
assert.doesNotMatch(sudokuOcrClient, /providerMessage/, "Provider response bodies must not be retained in OCR errors.");
assert.doesNotMatch(sudokuOcrRoute, /error:\s*error(?:\?\.message|\.message)/, "OCR request logs must not include exception messages.");

console.log("security configuration tests passed");
