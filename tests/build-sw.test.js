import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

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
assert.match(serviceWorker, /\.then\(\(\) => self\.skipWaiting\(\)\)/);
assert.match(serviceWorker, /\.then\(\(\) => self\.clients\.claim\(\)\)/);
assert.match(serviceWorker, /request\.mode === "navigate" && url\.pathname === "\/"/);
assert.match(serviceWorker, /fetch\(request\)\.catch\(\(\) => caches\.match\("\/"\)\)/);
assert.match(serviceWorker, /PRECACHE_URLS\.includes\(url\.pathname\)/);
assert.match(serviceWorker, /caches\.match\(url\.pathname\)/);
assert.doesNotMatch(serviceWorker, /cache\.put\(/);

const handlers = new Map();
const deletedCaches = [];
const cacheMatches = [];
const fetches = [];
let skipWaitingCalls = 0;
let claimCalls = 0;
let networkFailure = false;
const networkResponse = { source: "network" };
const cachedRoot = { source: "cached-root" };
const cachedAsset = { source: "cached-asset" };
const sandbox = {
  URL,
  self: {
    location: { origin: "https://sudokupilot.com" },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
    clients: {
      async claim() {
        claimCalls += 1;
      }
    }
  },
  caches: {
    async open() {
      return { addAll: async () => {} };
    },
    async keys() {
      return ["sudoku-pilot-old", "unrelated-cache"];
    },
    async delete(name) {
      deletedCaches.push(name);
      return true;
    },
    async match(path) {
      cacheMatches.push(path);
      if (path === "/") return cachedRoot;
      if (path === "/assets/app.js") return cachedAsset;
      return null;
    }
  },
  async fetch(request) {
    fetches.push(request.url);
    if (networkFailure) throw new Error("offline");
    return networkResponse;
  }
};
vm.runInNewContext(serviceWorker, sandbox);

let lifecyclePromise;
handlers.get("install")({ waitUntil(promise) { lifecyclePromise = promise; } });
await lifecyclePromise;
assert.equal(skipWaitingCalls, 1, "a fully precached worker should activate without waiting for every tab to close");

handlers.get("activate")({ waitUntil(promise) { lifecyclePromise = promise; } });
await lifecyclePromise;
assert.deepEqual(deletedCaches, ["sudoku-pilot-old"]);
assert.equal(claimCalls, 1, "the activated worker should control existing clients");

async function dispatchFetch(request) {
  let response;
  handlers.get("fetch")({
    request,
    respondWith(promise) {
      response = Promise.resolve(promise);
    }
  });
  return response;
}

const campaignRequest = {
  method: "GET",
  mode: "navigate",
  url: "https://sudokupilot.com/?campaign=1&view=campaign"
};
assert.equal(
  await dispatchFetch(campaignRequest),
  networkResponse,
  "online root navigation should not be satisfied by a stale cached app shell"
);
assert.equal(fetches.at(-1), campaignRequest.url, "the worker must preserve campaign query parameters");

networkFailure = true;
assert.equal(
  await dispatchFetch(campaignRequest),
  cachedRoot,
  "root navigation should fall back to the precached app shell offline"
);
assert.equal(cacheMatches.at(-1), "/");

networkFailure = false;
const fetchCountBeforeAsset = fetches.length;
assert.equal(
  await dispatchFetch({
    method: "GET",
    mode: "no-cors",
    url: "https://sudokupilot.com/assets/app.js"
  }),
  cachedAsset
);
assert.equal(fetches.length, fetchCountBeforeAsset, "versioned static assets should remain cache-first");

console.log("service worker build tests passed");
