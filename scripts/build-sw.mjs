import { createHash } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const distDir = resolve(process.argv[2] || new URL("../dist", import.meta.url).pathname);
const files = await listFiles(distDir);
const assets = files
  .map((file) => `/${relative(distDir, file).replaceAll("\\", "/")}`)
  .filter((path) => !path.endsWith("/sw.js"));
const precache = ["/", ...assets].filter((item, index, list) => list.indexOf(item) === index);
const cacheVersion = createHash("sha256").update(JSON.stringify(precache)).digest("hex").slice(0, 12);

const serviceWorker = `const CACHE_PREFIXES = ["sudoku-pilot-", "sudoku-method-"];
const CACHE_NAME = "${`sudoku-pilot-${cacheVersion}`}";
const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)) && name !== CACHE_NAME)
    .map((name) => caches.delete(name)))));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !PRECACHE_URLS.includes(url.pathname)) return;
  event.respondWith(caches.match(url.pathname).then((cached) => cached || fetch(request)));
});
`;

await writeFile(join(distDir, "sw.js"), serviceWorker);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(fullPath));
    else result.push(fullPath);
  }
  return result;
}
