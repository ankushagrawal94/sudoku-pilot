import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  initializeVercelAnalytics,
  isSafeAnalyticsReferrer,
  sanitizeVercelAnalyticsEvent
} from "../src/vercelAnalytics.js";

assert.equal(isSafeAnalyticsReferrer(""), true);
assert.equal(isSafeAnalyticsReferrer("https://newsletter.example/"), true);
assert.equal(isSafeAnalyticsReferrer("http://newsletter.example/"), false);
assert.equal(isSafeAnalyticsReferrer("https://newsletter.example:8443/"), false);
assert.equal(isSafeAnalyticsReferrer("https://newsletter.example/private"), false);
assert.equal(isSafeAnalyticsReferrer("https://newsletter.example/?token=private"), false);

assert.deepEqual(
  sanitizeVercelAnalyticsEvent(
    { type: "pageview", url: "https://www.sudokupilot.com/privacy/?token=private#fragment" },
    { hostname: "www.sudokupilot.com", referrer: "https://newsletter.example/" }
  ),
  { type: "pageview", url: "https://sudokupilot.com/privacy" }
);
assert.equal(
  sanitizeVercelAnalyticsEvent(
    { type: "pageview", url: "https://sudokupilot.com/private-account?token=private" },
    { hostname: "sudokupilot.com", referrer: "" }
  ),
  null
);
assert.equal(
  sanitizeVercelAnalyticsEvent(
    { type: "event", url: "https://sudokupilot.com/", payload: { token: "private" } },
    { hostname: "sudokupilot.com", referrer: "" }
  ),
  null,
  "Vercel Analytics is limited to aggregate pageviews and must reject custom payloads"
);

let localInjected = false;
assert.equal(initializeVercelAnalytics({
  injectClient: () => { localInjected = true; },
  location: { hostname: "localhost", protocol: "http:" },
  document: { referrer: "" }
}), false);
assert.equal(localInjected, false, "Vercel Analytics must remain off outside canonical production hosts");

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
let storedAttribution = JSON.stringify({ userId: "private-user", traits: { email: "private@example.com" } });
let injectedScript = null;
const browserWindow = {
  location: {
    href: "https://sudokupilot.com/?token=private#fragment",
    hostname: "sudokupilot.com",
    host: "sudokupilot.com",
    origin: "https://sudokupilot.com",
    protocol: "https:"
  },
  localStorage: {
    getItem: () => storedAttribution,
    setItem: (_key, value) => { storedAttribution = value; },
    removeItem: () => { storedAttribution = null; }
  }
};
const browserDocument = {
  referrer: "https://newsletter.example/",
  head: {
    querySelector: () => null,
    appendChild: (script) => { injectedScript = script; }
  },
  createElement: () => ({ dataset: {} })
};

try {
  globalThis.window = browserWindow;
  globalThis.document = browserDocument;
  assert.equal(initializeVercelAnalytics(), true);
} finally {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
}

assert.equal(storedAttribution, null, "stored Vercel identity and trait attribution must be cleared before SDK initialization");
assert.equal(injectedScript.src, "/_vercel/insights/script.js");
assert.equal(browserWindow.vaq[0][0], "beforeSend", "the installed @vercel/analytics wrapper must queue beforeSend before loading its runtime");

const requests = [];
const runtimeScript = { src: "https://sudokupilot.com/_vercel/insights/script.js", dataset: injectedScript.dataset };
const context = {
  URL,
  console,
  Date,
  JSON,
  Object,
  location: browserWindow.location,
  navigator: { webdriver: false, userAgent: "Synthetic verification" },
  localStorage: browserWindow.localStorage,
  history: { pushState() {} },
  document: {
    currentScript: runtimeScript,
    referrer: browserDocument.referrer,
    querySelectorAll: () => []
  },
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  },
  addEventListener() {},
  vaq: browserWindow.vaq
};
context.window = context;
vm.runInNewContext(
  await readFile(new URL("./fixtures/vercel-analytics-runtime-0.1.3.js", import.meta.url), "utf8"),
  context
);
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(requests.length, 1, "the real Vercel runtime must send one intercepted pageview");
assert.equal(requests[0].url, "/_vercel/insights/view");
const body = JSON.parse(requests[0].options.body);
assert.equal(body.o, "https://sudokupilot.com/");
assert.equal(body.r, "https://newsletter.example/");
assert.equal(body.userId, undefined);
assert.equal(body.groupId, undefined);
assert.equal(body.props, undefined);
assert.equal(JSON.stringify(requests).includes("private"), false);

browserDocument.referrer = "https://newsletter.example/private?token=private";
assert.equal(browserWindow.vaq[0][1]({ type: "pageview", url: "https://sudokupilot.com/" }), null, "each event must recheck the document referrer");

const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const headers = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
assert.equal(headers["referrer-policy"], "strict-origin", "the production HTTP policy must omit same-origin paths and queries from Referer headers");

console.log("Vercel Analytics SDK and HTTP referrer privacy tests passed");
