import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const outputRoot = resolve(root, "public");
const articlesRoot = resolve(root, "content/articles");
const siteUrl = "https://sudokupilot.com";
const aboutPath = "about";
const contactPath = "contact";
const privacyPath = "privacy";
const blockedPublicIdentifiers = (process.env.PUBLIC_CONTENT_BLOCKLIST || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const imageDimensions = {
  "/images/sudoku-pilot-naked-single-exact-move-v3.png": [1320, 1914, 660],
  "/images/sudoku-pilot-naked-single-first-clue-v3.png": [1320, 474, 660],
  "/images/sudoku-pilot-import-review-grid-v3.png": [1480, 1962, 740],
  "/images/ios-install-1-open-share.webp": [852, 1853],
  "/images/ios-install-2-share-sheet.webp": [852, 1846],
  "/images/ios-install-3-add-to-home-screen.webp": [852, 1846],
  "/images/ios-install-4-confirm.webp": [852, 1853]
};

const pages = await loadArticles();

for (const page of pages) {
  const dir = resolve(outputRoot, page.path);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "index.html"), renderPage(page));
}

const aboutDir = resolve(outputRoot, aboutPath);
await rm(aboutDir, { recursive: true, force: true });
await mkdir(aboutDir, { recursive: true });
await writeFile(resolve(aboutDir, "index.html"), renderAboutPage());

const contactDir = resolve(outputRoot, contactPath);
await rm(contactDir, { recursive: true, force: true });
await mkdir(contactDir, { recursive: true });
await writeFile(resolve(contactDir, "index.html"), renderContactPage());

const privacyDir = resolve(outputRoot, privacyPath);
await rm(privacyDir, { recursive: true, force: true });
await mkdir(privacyDir, { recursive: true });
await writeFile(resolve(privacyDir, "index.html"), renderPrivacyPage());

const sitemapUrls = ["", aboutPath, contactPath, privacyPath, ...pages.map((page) => page.path)]
  .map((path) => {
    const article = pages.find((page) => page.path === path);
    return `  <url><loc>${siteUrl}/${path}</loc><lastmod>${article?.updated || latestUpdated(pages)}</lastmod></url>`;
  })
  .join("\n");
await writeFile(resolve(outputRoot, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`);
await writeFile(resolve(outputRoot, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);

function renderPage(page) {
  const url = `${siteUrl}/${page.path}`;
  const [imageWidth, imageHeight, imageDisplayWidth] = page.image ? imageDimensions[page.image] : [];
  const related = page.related.map((path) => {
    const match = pages.find((candidate) => candidate.path === path);
    return `<li><a href="/${match.path}/">${match.title}</a></li>`;
  }).join("");
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    datePublished: page.published,
    dateModified: page.updated,
    author: { "@type": "Organization", name: "Sudoku Pilot Admin" },
    publisher: { "@type": "Organization", name: "Sudoku Pilot" },
    mainEntityOfPage: url,
    ...(page.image ? { image: `${siteUrl}${page.image}` } : {})
  }).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeAttribute(page.description)}" />
    <link rel="canonical" href="${url}" />
    <link rel="stylesheet" href="/content.css" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeAttribute(page.title)}" />
    <meta property="og:description" content="${escapeAttribute(page.description)}" />
    <meta property="og:url" content="${url}" />
${page.image ? `    <meta property="og:image" content="${siteUrl}${page.image}" />
` : ""}    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${schema}</script>
    <title>${page.title} | Sudoku Pilot</title>
  </head>
  <body>
    <header class="site-header">
      <a class="wordmark" href="/">sudoku pilot</a>
      <nav aria-label="Main navigation">
        <a href="/sudoku-coach/">Coach</a>
        <a href="/practice-sudoku-techniques/">Practice</a>
        <a href="/sudoku-without-guessing/">Logic guarantee</a>
        <a href="/sudoku-screenshot-import/">Screenshot import</a>
        <a href="/about/">About</a>
      </nav>
      <a class="app-link" href="/">Open the app</a>
    </header>
    <main>
      <article>
        <header class="article-header">
          <h1>${page.title}</h1>
          <p class="dek">${page.intro}</p>
          <p class="byline">By Admin · Updated ${formatDate(page.updated)}</p>
        </header>
${page.image ? `        <figure style="--article-image-width: ${imageDisplayWidth}px">
          <img src="${page.image}" alt="${escapeAttribute(page.imageAlt)}" width="${imageWidth}" height="${imageHeight}" />
          <figcaption>${page.imageCaption}</figcaption>
        </figure>
` : ""}        <div class="article-body">${renderSections(page.sections)}</div>
        <aside class="try-card">
          <h2>Try it on a puzzle</h2>
          <p>Open Sudoku Pilot and use the same feature on a generated or imported board.</p>
          <a class="primary-link" href="/">Open Sudoku Pilot</a>
        </aside>
        <aside class="related">
          <h2>Keep reading</h2>
          <ul>${related}</ul>
        </aside>
      </article>
    </main>
    <footer>
      <span>Sudoku Pilot</span>
      <a href="/about/">About</a>
      <a href="/contact/">Contact</a>
      <a href="/privacy/">Privacy</a>
    </footer>
  </body>
</html>`;
}

function renderAboutPage() {
  const url = `${siteUrl}/${aboutPath}`;
  const description = "Learn how Sudoku Pilot handles hints, technique practice, puzzle imports, offline play, privacy, and logical puzzle guarantees.";
  const groups = [
    {
      heading: "Learn and practice Sudoku",
      paths: ["sudoku-coach", "sudoku-hints-that-explain", "practice-sudoku-techniques", "sudoku-candidate-notes", "sudoku-input-settings"]
    },
    {
      heading: "Use Sudoku Pilot your way",
      paths: ["sudoku-screenshot-import", "offline-sudoku-app", "ad-free-private-sudoku", "sudoku-without-mistake-penalties"]
    },
    {
      heading: "How the app was built",
      paths: ["sudoku-without-guessing", "logically-unique-sudoku-puzzles", "why-we-built-this"]
    }
  ];
  const cards = groups.map((group) => `
        <section class="guide-group">
          <h2>${group.heading}</h2>
          <div class="guide-grid">
            ${group.paths.map((path) => {
              const article = pages.find((page) => page.path === path);
              return `<a class="guide-card" href="/${article.path}/">
                <span>${article.eyebrow}</span>
                <h3>${article.title}</h3>
                <p>${article.intro}</p>
              </a>`;
            }).join("\n")}
          </div>
        </section>`).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <link rel="stylesheet" href="/content.css" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="About Sudoku Pilot" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <title>About | Sudoku Pilot</title>
  </head>
  <body>
    <header class="site-header">
      <a class="wordmark" href="/">sudoku pilot</a>
      <nav aria-label="Main navigation">
        <a href="/about/" aria-current="page">About</a>
        <a href="/sudoku-coach/">Coach</a>
        <a href="/practice-sudoku-techniques/">Practice</a>
        <a href="/sudoku-without-guessing/">Logic guarantee</a>
        <a href="/sudoku-screenshot-import/">Screenshot import</a>
      </nav>
      <a class="app-link" href="/">Open the app</a>
    </header>
    <main class="about-main">
      <header class="article-header about-header">
        <h1>Learn how the app works</h1>
        <p class="dek">Read about the coach, practice tools, puzzle guarantee, screenshot import, offline access, and the decisions behind Sudoku Pilot.</p>
      </header>
${cards}
    </main>
    <footer>
      <span>Sudoku Pilot</span>
      <a href="/about/" aria-current="page">About</a>
      <a href="/contact/">Contact</a>
      <a href="/privacy/">Privacy</a>
    </footer>
  </body>
</html>`;
}

function renderContactPage() {
  const url = `${siteUrl}/${contactPath}`;
  const description = "Contact Sudoku Pilot with feedback, questions, bug reports, or ideas.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <link rel="stylesheet" href="/content.css" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Contact Sudoku Pilot" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <title>Contact | Sudoku Pilot</title>
  </head>
  <body>
    <header class="site-header">
      <a class="wordmark" href="/">sudoku pilot</a>
      <nav aria-label="Main navigation">
        <a href="/sudoku-coach/">Coach</a>
        <a href="/practice-sudoku-techniques/">Practice</a>
        <a href="/offline-sudoku-app/">Offline app</a>
        <a href="/about/">About</a>
      </nav>
      <a class="app-link" href="/">Open the app</a>
    </header>
    <main>
      <article class="contact-page">
        <header class="article-header">
          <h1>Send us a note</h1>
          <p class="dek">Questions, bug reports, confusing hints, and ideas are welcome.</p>
        </header>
        <section class="contact-card">
          <h2>Email Sudoku Pilot</h2>
          <p>Write to <a href="mailto:hello@sudokupilot.com">hello@sudokupilot.com</a>. Include the puzzle or technique name when it helps explain what you saw.</p>
          <a class="primary-link" href="mailto:hello@sudokupilot.com">Email hello@sudokupilot.com</a>
        </section>
      </article>
    </main>
    <footer>
      <span>Sudoku Pilot</span>
      <a href="/about/">About</a>
      <a href="/contact/" aria-current="page">Contact</a>
      <a href="/privacy/">Privacy</a>
    </footer>
  </body>
</html>`;
}

function renderPrivacyPage() {
  const url = `${siteUrl}/${privacyPath}`;
  const description = "How Sudoku Pilot stores puzzle data, processes screenshot imports, and uses product analytics.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <link rel="stylesheet" href="/content.css" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Sudoku Pilot privacy" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <title>Privacy | Sudoku Pilot</title>
  </head>
  <body>
    <header class="site-header">
      <a class="wordmark" href="/">sudoku pilot</a>
      <nav aria-label="Main navigation">
        <a href="/sudoku-coach/">Coach</a>
        <a href="/practice-sudoku-techniques/">Practice</a>
        <a href="/about/">About</a>
        <a href="/privacy/" aria-current="page">Privacy</a>
      </nav>
      <a class="app-link" href="/">Open the app</a>
    </header>
    <main>
      <article class="contact-page">
        <header class="article-header">
          <h1>Privacy</h1>
          <p class="dek">Sudoku Pilot stores gameplay locally while product analytics records how the app is used.</p>
          <p class="byline">Last updated July 21, 2026</p>
        </header>
        <section>
          <h2>Game data stays in your browser</h2>
          <p>Puzzles, entries, pencil notes, undo history, practice progress, and preferences are stored in your browser's local storage. Sudoku Pilot does not provide an account or sync this data to an application server. You can remove it with the app's Clear local data action or by clearing this site's stored data in your browser.</p>
        </section>
        <section>
          <h2>Screenshot imports are processed locally</h2>
          <p>When you import a screenshot, the image and OCR processing stay in your browser. The app downloads its OCR software and language data from the Sudoku Pilot site, but it does not upload your screenshot to an OCR service.</p>
        </section>
        <section>
          <h2>Hosting and analytics</h2>
          <p>The site is hosted by Vercel, which may process standard request information needed to deliver the site and protect its services. Sudoku Pilot uses Vercel Web Analytics for aggregate page traffic and PostHog for product analytics. PostHog assigns a persistent anonymous browser identifier and records semantic events such as app opens, puzzle milestones, hints, lessons, practice, and screenshot-import workflow outcomes. These custom events can include aggregate properties such as difficulty, puzzle source, elapsed time, move count, and hint count.</p>
          <p>Session replay records puzzle interactions and can include displayed puzzle values, notes, lessons, and hint content. Automatic collection records page views, clicks, scrolls, heatmaps, dead clicks, performance metrics, errors, and console messages. PostHog can also deliver surveys and feature flags configured for the project. The imported screenshot preview remains excluded from replay, and custom events do not attach screenshots or raw puzzle contents. PostHog manages analytics delivery and may buffer or retry delivery after a connection failure. Clearing local data resets the anonymous analytics identifier. See <a href="https://posthog.com/privacy">PostHog's privacy information</a> and <a href="https://vercel.com/docs/analytics/privacy-policy">Vercel's analytics documentation</a>.</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>If you email <a href="mailto:hello@sudokupilot.com">hello@sudokupilot.com</a>, the information you choose to send is used to respond to your message.</p>
        </section>
        <section id="source-code">
          <h2>Source code and third-party software</h2>
          <p>The app's <a href="https://github.com/ankushagrawal94/sudoku-pilot">source code</a> is available under the <a href="/licenses/PolyForm-Noncommercial-1.0.0.txt">PolyForm Noncommercial License 1.0.0</a>. It permits noncommercial use, modification, and redistribution, but does not permit commercial use. The Sudoku Pilot name, logo, and branding are separately reserved. See the <a href="/third-party-notices.txt">third-party notices</a> for separately licensed components and data.</p>
        </section>
      </article>
    </main>
    <footer>
      <span>Sudoku Pilot</span>
      <a href="/about/">About</a>
      <a href="/contact/">Contact</a>
      <a href="/privacy/" aria-current="page">Privacy</a>
    </footer>
  </body>
</html>`;
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return escapeAttribute(value).replaceAll("'", "&#39;");
}

function renderSections(sections) {
  return sections.map((section) => `
      <section>
        <h2>${escapeHtml(section.heading)}</h2>
        ${section.blocks.map(renderBlock).join("\n")}
      </section>`).join("\n");
}

function renderBlock(block) {
  if (block.type === "paragraph") return `<p>${escapeHtml(block.text)}</p>`;
  if (block.type === "link") return `<p><a href="${escapeAttribute(block.href)}">${escapeHtml(block.label)}</a></p>`;
  if (block.type === "list" || block.type === "ordered-list") {
    const tag = block.type === "ordered-list" ? "ol" : "ul";
    return `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
  }
  if (block.type === "image-gallery") {
    return `<div class="install-gallery" aria-label="${escapeAttribute(block.label)}">${block.items.map((item, index) => {
      const [width, height] = imageDimensions[item.src];
      return `<figure><a href="${escapeAttribute(item.src)}"><img src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.alt)}" width="${width}" height="${height}" loading="lazy" /></a><figcaption><span>${index + 1}</span><strong>${escapeHtml(item.caption)}</strong></figcaption></figure>`;
    }).join("")}</div>`;
  }
  throw new Error(`Unsupported article block type: ${block.type}`);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function latestUpdated(articles) {
  return [...articles].map((article) => article.updated).sort().at(-1);
}

async function loadArticles() {
  const files = (await readdir(articlesRoot)).filter((file) => file.endsWith(".json")).sort();
  const articles = await Promise.all(files.map(async (file) => {
    const article = JSON.parse(await readFile(resolve(articlesRoot, file), "utf8"));
    validateArticle(article, file);
    if (article.image) await access(resolve(outputRoot, article.image.replace(/^\//, "")));
    for (const section of article.sections) {
      for (const block of section.blocks) {
        if (block.type !== "image-gallery") continue;
        for (const item of block.items) await access(resolve(outputRoot, item.src.replace(/^\//, "")));
      }
    }
    return article;
  }));
  const paths = new Set(articles.map((article) => article.path));
  for (const article of articles) {
    for (const related of article.related) {
      if (!paths.has(related)) throw new Error(`${article.path}: unknown related article ${related}`);
    }
  }
  return articles;
}

function validateArticle(article, file) {
  const requiredStrings = ["path", "title", "description", "published", "updated", "eyebrow", "intro"];
  for (const field of requiredStrings) {
    if (typeof article[field] !== "string" || !article[field].trim()) throw new Error(`${file}: ${field} is required`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.path)) throw new Error(`${file}: invalid path`);
  if (!Array.isArray(article.related) || article.related.length < 1) throw new Error(`${file}: related articles are required`);
  if (!Array.isArray(article.sections) || article.sections.length < 1) throw new Error(`${file}: sections are required`);
  for (const section of article.sections) {
    if (typeof section.heading !== "string" || !section.heading.trim()) throw new Error(`${file}: every section needs a heading`);
    if (!Array.isArray(section.blocks) || section.blocks.length < 1) throw new Error(`${file}: every section needs content blocks`);
    for (const block of section.blocks) validateBlock(block, file);
  }
  const imageFields = [article.image, article.imageAlt, article.imageCaption];
  if (imageFields.some(Boolean) && !imageFields.every((value) => typeof value === "string" && value.trim())) {
    throw new Error(`${file}: image, imageAlt, and imageCaption must be supplied together`);
  }
  if (article.image && !imageDimensions[article.image]) throw new Error(`${file}: image dimensions are missing for ${article.image}`);
  if (/\bnot (?:just )?[^.!?]{0,80}\bbut\b/i.test(JSON.stringify(article))) {
    throw new Error(`${file}: contrastive negative framing is blocked`);
  }
  if (/—/.test(JSON.stringify(article))) throw new Error(`${file}: em dashes are blocked`);
  const publicText = JSON.stringify(article).toLowerCase();
  for (const identifier of blockedPublicIdentifiers) {
    if (publicText.includes(identifier)) throw new Error(`${file}: private identifier is blocked from public content`);
  }
}

function validateBlock(block, file) {
  if (block.type === "paragraph" && typeof block.text === "string" && block.text.trim()) return;
  if ((block.type === "list" || block.type === "ordered-list") && Array.isArray(block.items) && block.items.length && block.items.every((item) => typeof item === "string" && item.trim())) return;
  if (block.type === "link" && typeof block.label === "string" && block.label.trim() && typeof block.href === "string" && /^(?:\/|https:\/\/)/.test(block.href)) return;
  if (block.type === "image-gallery" && typeof block.label === "string" && block.label.trim() && Array.isArray(block.items) && block.items.length && block.items.every((item) => (
    typeof item.src === "string" && item.src.startsWith("/images/") && imageDimensions[item.src]
    && typeof item.alt === "string" && item.alt.trim()
    && typeof item.caption === "string" && item.caption.trim()
  ))) return;
  throw new Error(`${file}: invalid ${block.type || "unknown"} block`);
}
