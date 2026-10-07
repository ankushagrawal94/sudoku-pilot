import { inject } from "@vercel/analytics";

const CANONICAL_HOSTS = new Set(["sudokupilot.com", "www.sudokupilot.com"]);
const PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/ad-free-private-sudoku",
  "/contact",
  "/how-we-rate-sudoku-difficulty",
  "/logically-unique-sudoku-puzzles",
  "/offline-sudoku-app",
  "/practice-sudoku-techniques",
  "/privacy",
  "/sudoku-candidate-notes",
  "/sudoku-coach",
  "/sudoku-hints-that-explain",
  "/sudoku-input-settings",
  "/sudoku-screenshot-import",
  "/sudoku-without-guessing",
  "/sudoku-without-mistake-penalties",
  "/why-we-built-this"
]);

function normalizedPublicPath(pathname) {
  const normalized = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PUBLIC_PATHS.has(normalized) ? normalized : null;
}

export function isSafeAnalyticsReferrer(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.port
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && url.pathname === "/";
  } catch {
    return false;
  }
}

export function sanitizeVercelAnalyticsEvent(event, { hostname, referrer } = {}) {
  if (event?.type !== "pageview" || !CANONICAL_HOSTS.has(hostname) || !isSafeAnalyticsReferrer(referrer)) return null;
  try {
    const url = new URL(event.url, `https://${hostname}`);
    const pathname = normalizedPublicPath(url.pathname);
    if (url.protocol !== "https:" || !CANONICAL_HOSTS.has(url.hostname) || url.port || !pathname) return null;
    return { ...event, url: `https://sudokupilot.com${pathname}` };
  } catch {
    return null;
  }
}

export function initializeVercelAnalytics({
  injectClient = inject,
  location = globalThis.window?.location,
  document = globalThis.document,
  storage = globalThis.window?.localStorage
} = {}) {
  const hostname = location?.hostname || "";
  if (!CANONICAL_HOSTS.has(hostname) || location?.protocol !== "https:" || !isSafeAnalyticsReferrer(document?.referrer)) {
    return false;
  }
  try {
    storage?.removeItem("__va_attribution");
  } catch {
    // Analytics remains anonymous when storage is unavailable.
  }
  injectClient({
    beforeSend: (event) => sanitizeVercelAnalyticsEvent(event, {
      hostname,
      referrer: document?.referrer || ""
    })
  });
  return true;
}
