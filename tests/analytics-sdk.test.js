import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const analyticsSource = await readFile(new URL("../src/analytics.js", import.meta.url), "utf8");
const posthogSource = await readFile(new URL("../node_modules/posthog-js/dist/module.full.no-external.js", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => false });
    window.__POSTHOG_TRANSPORTS__ = [];

    const record = async (transport, url, body) => {
      const text = body instanceof Blob ? await body.text() : String(body ?? "");
      window.__POSTHOG_TRANSPORTS__.push({ transport, url: String(url), body: text });
    };

    window.fetch = async (url, init = {}) => {
      await record("fetch", url, init.body);
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    };

    class InterceptedXHR {
      readyState = 0;
      status = 0;
      responseText = "";
      headers = {};
      open(method, url) { this.method = method; this.url = url; }
      setRequestHeader(name, value) { this.headers[name] = value; }
      send(body) {
        void record("XHR", this.url, body);
        this.readyState = 4;
        this.status = 200;
        this.responseText = "{}";
        queueMicrotask(() => this.onreadystatechange?.());
      }
    }
    window.XMLHttpRequest = InterceptedXHR;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url, body) => {
        void record("sendBeacon", url, body);
        return true;
      }
    });
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "sudokupilot.com") return route.abort();
    if (url.pathname === "/analytics.js" || url.pathname === "/posthog.js") {
      return route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: url.pathname === "/analytics.js" ? analyticsSource : posthogSource
      });
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>SDK transport test</title>" });
  });

  const page = await context.newPage();
  await page.goto("https://sudokupilot.com/?utm_source=private-source&utm_campaign=private-campaign&gclid=private-click#private-fragment", {
    referer: "https://www.google.com/search?q=private-keyword"
  });
  await page.evaluate(async () => {
    const [{ createProductAnalytics }, { default: posthog }] = await Promise.all([
      import("/analytics.js"),
      import("/posthog.js")
    ]);
    const analytics = createProductAnalytics({
      client: posthog,
      key: "phc_synthetic_transport_test",
      host: "https://us.i.posthog.com"
    });
    if (!analytics.init()) throw new Error("PostHog did not initialize");
    // Headless Chromium is intentionally filtered as a bot by PostHog. Disable
    // that test-environment filter only after verifying the production config.
    if (!posthog.config.advanced_disable_flags || posthog.config.capture_performance !== false) {
      throw new Error("privacy configuration did not reach the installed SDK");
    }
    posthog.config.opt_out_useragent_filter = true;
    posthog.capture("puzzle_started", {
      difficulty: "hard",
      source: "generated"
    }, { send_instantly: true });
  });
  await page.waitForTimeout(250);

  const requests = await page.evaluate(() => window.__POSTHOG_TRANSPORTS__);
  assert.ok(requests.length > 0, "the installed PostHog SDK must attempt a controlled outbound event");
  assert.equal(requests.some(({ url }) => new URL(url).pathname.includes("flags")), false, "flags requests must remain disabled");

  const eventBodies = requests
    .map(({ body }) => {
      try { return JSON.parse(body); } catch { return null; }
    })
    .filter(Boolean);
  const started = eventBodies.find(({ event }) => event === "puzzle_started");
  assert.ok(started, "the controlled puzzle event must reach the intercepted SDK transport");
  assert.equal(started.properties.difficulty, "hard");
  assert.equal(started.properties.source, "generated");
  assert.equal(started.properties.$current_url, "https://sudokupilot.com/");
  assert.equal(started.properties.$referring_domain, "www.google.com");

  const serialized = JSON.stringify(requests);
  for (const marker of [
    "private-source", "private-campaign", "private-click", "private-fragment", "private-keyword",
    "utm_source", "utm_campaign", "gclid", "ph_keyword", "$referrer", "$initial_referrer", "$session_entry_referrer"
  ]) {
    assert.equal(serialized.includes(marker), false, `intercepted SDK transport leaked ${marker}`);
  }

  console.log(`PostHog SDK transport privacy test passed (${requests.length} intercepted request${requests.length === 1 ? "" : "s"})`);
} finally {
  await browser.close();
}
