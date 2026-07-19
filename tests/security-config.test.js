import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [vercelConfig, appSource] = await Promise.all([
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8")
]);
const vercel = JSON.parse(vercelConfig);
const packageConfig = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const headers = Object.fromEntries(vercel.headers?.[0]?.headers?.map(({ key, value }) => [key.toLowerCase(), value]) || []);

assert.match(headers["content-security-policy"] || "", /default-src 'self'/);
assert.match(headers["content-security-policy"] || "", /script-src 'self'/);
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

console.log("security configuration tests passed");
