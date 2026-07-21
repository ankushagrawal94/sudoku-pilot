import { createProductAnalytics } from "./analytics.js";

export function createBrowserProductAnalytics(options = {}) {
  const env = import.meta.env || {};
  const testClient = options.client ?? globalThis.window?.__SUDOKU_ANALYTICS_CLIENT__;
  const key = options.key ?? env.VITE_POSTHOG_KEY ?? (testClient ? "browser-test-key" : "");
  const host = options.host ?? env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";
  const online = options.online ?? (() => globalThis.navigator?.onLine !== false);
  const loadClient = options.loadClient ?? (() => import("posthog-js/dist/module.no-external.js"));
  const pending = [];
  let analytics = null;
  let resetRequested = false;

  function activate(clientModule) {
    const client = clientModule.default || clientModule;
    analytics = createProductAnalytics({ client, key, host, online });
    if (!analytics.init()) return;
    if (resetRequested) {
      analytics.reset();
      return;
    }
    pending.splice(0).forEach(([event, properties]) => analytics.capture(event, properties));
  }

  return {
    init() {
      if (!key) return false;
      if (testClient) {
        activate(testClient);
        return true;
      }
      loadClient()
        .then(activate)
        .catch(() => {
          pending.length = 0;
        });
      return true;
    },

    capture(event, properties = {}) {
      if (analytics) return analytics.capture(event, properties);
      if (!key || !online() || resetRequested) return false;
      if (pending.length < 50) pending.push([event, properties]);
      return true;
    },

    reset() {
      if (!key) return false;
      pending.length = 0;
      resetRequested = true;
      analytics?.reset();
      return true;
    }
  };
}
