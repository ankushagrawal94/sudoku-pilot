import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const fixture = await mkdtemp(join(tmpdir(), "sudoku-pilot-sw-"));
await mkdir(join(fixture, "assets"));
await writeFile(join(fixture, "index.html"), "<!doctype html>");
await writeFile(join(fixture, "assets", "app.js"), "console.log('offline')");

const result = spawnSync(process.execPath, ["scripts/build-sw.mjs", fixture], {
  cwd: process.cwd(),
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr);
const serviceWorker = await readFile(join(fixture, "sw.js"), "utf8");
assert.match(serviceWorker, /const CACHE_NAME = "sudoku-pilot-[a-f0-9]{12}"/);
assert.match(serviceWorker, /"sudoku-method-"/);
assert.match(serviceWorker, /CACHE_PREFIXES\.some/);
assert.match(serviceWorker, /"\/assets\/app\.js"/);
assert.match(serviceWorker, /cache\.addAll\(PRECACHE_URLS\)/);
assert.match(serviceWorker, /PRECACHE_URLS\.includes\(url\.pathname\)/);
assert.match(serviceWorker, /caches\.match\(url\.pathname\)/);
assert.doesNotMatch(serviceWorker, /cache\.put\(/);
assert.doesNotMatch(serviceWorker, /skipWaiting/);
assert.doesNotMatch(serviceWorker, /clients\.claim/);

console.log("service worker build tests passed");
