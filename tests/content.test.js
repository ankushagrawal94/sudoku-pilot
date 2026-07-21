import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const articleFiles = (await readdir("content/articles")).filter((file) => file.endsWith(".json")).sort();
const articles = await Promise.all(articleFiles.map(async (file) => JSON.parse(await readFile(`content/articles/${file}`, "utf8"))));
const pages = articles.map((article) => article.path);

const build = spawnSync(process.execPath, ["scripts/build-content.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8"
});
assert.equal(build.status, 0, build.stderr);

for (const page of pages) {
  const html = await readFile(`public/${page}/index.html`, "utf8");
  assert.match(html, /<title>[^<]+ \| Sudoku Pilot<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/sudokupilot\.com\//);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.match(html, /<h1>[^<]+<\/h1>/);
  assert.doesNotMatch(html, /<p class="eyebrow">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /<p class="byline">By Admin · Updated /);
  assert.match(html, /"author":\{"@type":"Organization","name":"Sudoku Pilot Admin"\}/);
  const article = articles.find((candidate) => candidate.path === page);
  if (article.image) {
    const imageSource = article.image.replaceAll("/", "\\/");
    const imageMatch = html.match(new RegExp(`<figure style="--article-image-width: (\\d+)px">\\s*<img src="${imageSource}"[^>]+width="(\\d+)" height="(\\d+)"`));
    assert.ok(imageMatch, `${article.path} must declare intrinsic and display dimensions`);
    const [, displayWidthText, intrinsicWidthText, intrinsicHeightText] = imageMatch;
    const displayWidth = Number(displayWidthText);
    const intrinsicWidth = Number(intrinsicWidthText);
    const intrinsicHeight = Number(intrinsicHeightText);
    const image = await readFile(`public${article.image}`);
    const dimensions = pngDimensions(image);
    assert.deepEqual(dimensions, { width: intrinsicWidth, height: intrinsicHeight }, `${article.image} dimensions must match its HTML attributes`);
    assert.ok(displayWidth <= 740, `${article.image} display width exceeds the article layout`);
    assert.ok(intrinsicWidth >= displayWidth * 2, `${article.image} must provide at least 2x desktop density`);
    assert.match(html, new RegExp(`<img src="${imageSource}`));
  } else {
    assert.doesNotMatch(html, /<figure>/);
    assert.doesNotMatch(html, /property="og:image"/);
  }
  assert.match(html, new RegExp(`datePublished[^<]+${articles.find((article) => article.path === page).published}`));
  assert.doesNotMatch(html, /sudoku method|sudoku-method|sudoku-app-wine\.vercel\.app/i);
  assert.doesNotMatch(html, /\bnot (?:just )?[^.!?]{0,80}\bbut\b/i);
  assert.doesNotMatch(html, /—/);
}

for (const image of [
  "sudoku-pilot-exact-move-focused.png",
  "sudoku-pilot-explained-hint-focused.png",
  "sudoku-pilot-screenshot-import-focused.png"
]) {
  await access(`public/images/${image}`);
}
for (const notice of [
  "public/third-party-notices.txt",
  "public/licenses/PolyForm-Noncommercial-1.0.0.txt",
  "public/licenses/Apache-2.0.txt",
  "public/licenses/sudoku-gen-MIT.txt",
  "public/licenses/Vercel-Analytics-MIT.txt"
]) {
  await access(notice);
}

const sitemap = await readFile("public/sitemap.xml", "utf8");
for (const page of pages) assert.match(sitemap, new RegExp(`<loc>https://sudokupilot\\.com/${page}</loc>`));
assert.match(sitemap, /<loc>https:\/\/sudokupilot\.com\/contact<\/loc>/);
assert.match(sitemap, /<loc>https:\/\/sudokupilot\.com\/about<\/loc>/);
assert.match(sitemap, /<loc>https:\/\/sudokupilot\.com\/privacy<\/loc>/);

const about = await readFile("public/about/index.html", "utf8");
assert.match(about, /<title>About \| Sudoku Pilot<\/title>/);
assert.match(about, /<link rel="canonical" href="https:\/\/sudokupilot\.com\/about"/);
assert.doesNotMatch(about, /<p class="eyebrow">/);
for (const article of articles) {
  assert.match(about, new RegExp(`href="/${article.path}/"`));
}

const contact = await readFile("public/contact/index.html", "utf8");
assert.match(contact, /<title>Contact \| Sudoku Pilot<\/title>/);
assert.match(contact, /<link rel="canonical" href="https:\/\/sudokupilot\.com\/contact"/);
assert.doesNotMatch(contact, /<p class="eyebrow">/);
assert.match(contact, /mailto:hello@sudokupilot\.com/);
assert.match(contact, />hello@sudokupilot\.com</);

const privacy = await readFile("public/privacy/index.html", "utf8");
assert.match(privacy, /<title>Privacy \| Sudoku Pilot<\/title>/);
assert.match(privacy, /<link rel="canonical" href="https:\/\/sudokupilot\.com\/privacy"/);
assert.match(privacy, /Game data stays in your browser/);
assert.match(privacy, /Screenshot imports are processed locally/);
assert.match(privacy, /Vercel Web Analytics/);
assert.match(privacy, /PostHog/);
assert.match(privacy, /persistent anonymous browser identifier/);
assert.match(privacy, /Session replay is disabled/);
assert.match(privacy, /does not receive screenshots, recognized grids, cell values, or pencil notes/);
assert.match(privacy, /offline activity is not queued/);
assert.match(privacy, /Clear local data/);
assert.match(privacy, /third-party-notices\.txt/);
assert.match(privacy, /github\.com\/ankushagrawal94\/sudoku-pilot/);
assert.match(privacy, /PolyForm Noncommercial License 1\.0\.0/);
assert.match(privacy, /branding are separately reserved/);

const publicNotices = await readFile("public/third-party-notices.txt", "utf8");
assert.match(publicNotices, /PostHog JavaScript SDK/);

const home = await readFile("index.html", "utf8");
assert.match(home, /<link rel="canonical" href="https:\/\/sudokupilot\.com\/"/);
assert.match(home, /<meta property="og:title" content="Sudoku Pilot/);
assert.match(home, /<meta property="og:url" content="https:\/\/sudokupilot\.com\/"/);
assert.doesNotMatch(home, /sudoku method|sudoku-method|sudoku-app-wine\.vercel\.app/i);

const manifest = await readFile("public/manifest.webmanifest", "utf8");
assert.match(manifest, /"name": "Sudoku Pilot"/);
assert.match(manifest, /"short_name": "Pilot"/);

console.log("content build tests passed");

function pngDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
