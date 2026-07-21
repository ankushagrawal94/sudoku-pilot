import assert from "node:assert/strict";
import { createProductAnalytics, createPuzzleJourney } from "../src/analytics.js";
import { createBrowserProductAnalytics } from "../src/browserAnalytics.js";

{
  const calls = [];
  const analytics = createProductAnalytics({
    client: {
      init: (...args) => calls.push(["init", ...args]),
      capture: (...args) => calls.push(["capture", ...args]),
      reset: (...args) => calls.push(["reset", ...args])
    },
    key: "",
    host: "https://us.i.posthog.com"
  });

  assert.equal(analytics.init(), false);
  assert.equal(analytics.capture("app_opened"), false);
  assert.equal(analytics.reset(), false);
  assert.deepEqual(calls, [], "missing configuration must leave analytics disabled");
}

{
  const calls = [];
  let connected = true;
  const analytics = createProductAnalytics({
    client: {
      init: (...args) => calls.push(["init", ...args]),
      capture: (...args) => calls.push(["capture", ...args]),
      reset: (...args) => calls.push(["reset", ...args])
    },
    key: "test-key",
    host: "https://us.i.posthog.com",
    online: () => connected
  });

  assert.equal(analytics.init(), true);
  assert.deepEqual(calls[0], ["init", "test-key", {
    api_host: "https://us.i.posthog.com",
    ui_host: "https://us.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    persistence: "localStorage",
    person_profiles: "identified_only",
    disable_session_recording: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    advanced_disable_feature_flags: true,
    capture_heatmaps: false,
    enable_heatmaps: false,
    capture_performance: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    disable_surveys: true,
    enable_recording_console_log: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    session_recording: {
      blockSelector: ".analytics-block",
      maskAllInputs: true
    },
    loaded: calls[0]?.[2]?.loaded
  }]);

  assert.equal(analytics.capture("app_opened", { returning_local_player: true }), true);
  connected = false;
  assert.equal(analytics.capture("puzzle_started", { difficulty: "hard" }), false);
  assert.equal(analytics.reset(), true);
  assert.deepEqual(calls.filter(([kind]) => kind === "capture"), [
    ["capture", "app_opened", { returning_local_player: true }]
  ]);
  assert.deepEqual(calls.at(-1), ["reset"]);
}

{
  const analytics = createProductAnalytics({
    client: {
      init() {},
      capture() { throw new Error("network adapter failed"); },
      reset() { throw new Error("storage adapter failed"); }
    },
    key: "test-key",
    host: "https://us.i.posthog.com"
  });

  assert.equal(analytics.init(), true);
  assert.doesNotThrow(() => analytics.capture("app_opened"));
  assert.equal(analytics.capture("app_opened"), false);
  assert.doesNotThrow(() => analytics.reset());
  assert.equal(analytics.reset(), false);
}

{
  const analytics = createProductAnalytics({
    client: { init() { throw new Error("initialization failed"); } },
    key: "test-key",
    host: "https://us.i.posthog.com"
  });

  assert.doesNotThrow(() => analytics.init());
  assert.equal(analytics.init(), false);
}

{
  const calls = [];
  let resolveClient;
  const clientReady = new Promise((resolve) => { resolveClient = resolve; });
  const analytics = createBrowserProductAnalytics({
    key: "test-key",
    host: "https://us.i.posthog.com",
    online: () => true,
    loadClient: () => clientReady
  });

  assert.equal(analytics.init(), true);
  assert.equal(analytics.capture("app_opened"), true);
  assert.equal(analytics.reset(), true);
  resolveClient({
    init: (...args) => calls.push(["init", ...args]),
    capture: (...args) => calls.push(["capture", ...args]),
    reset: (...args) => calls.push(["reset", ...args])
  });
  await clientReady;
  await Promise.resolve();

  assert.equal(calls[0][0], "init");
  assert.deepEqual(calls.at(-1), ["reset"]);
  assert.equal(calls.some(([kind]) => kind === "capture"), false, "reset must discard queued events");
}

{
  const events = [];
  const journey = createPuzzleJourney((event, properties) => events.push([event, properties]));
  const context = { difficulty: "medium", source: "generated" };

  journey.resume(context, 0);
  journey.recordHint({ technique: "Hidden Single" });
  assert.deepEqual(events, [
    ["puzzle_started", context],
    ["hint_requested", { ...context, technique: "Hidden Single" }]
  ]);

  events.length = 0;
  journey.resume(context, 0);
  journey.recordInteraction();
  journey.recordInteraction();
  assert.deepEqual(events, [["puzzle_started", context]]);
}

{
  const events = [];
  const journey = createPuzzleJourney((event, properties) => events.push([event, properties]));

  journey.resume({ difficulty: "hard", source: "generated" }, 0);
  journey.recordMove(1);
  journey.recordMove(2);
  journey.recordMove(5);
  journey.recordMove(6);
  journey.recordHint({ technique: "Naked Single", stage: 1 });
  journey.complete({ active_seconds: 120, hints_used: 1, moves: 6 });

  assert.deepEqual(events, [
    ["puzzle_started", { difficulty: "hard", source: "generated" }],
    ["puzzle_first_move", { difficulty: "hard", source: "generated" }],
    ["puzzle_meaningful_play", { difficulty: "hard", source: "generated", move_threshold: 5 }],
    ["hint_requested", { difficulty: "hard", source: "generated", technique: "Naked Single", stage: 1 }],
    ["puzzle_completed", { difficulty: "hard", source: "generated", active_seconds: 120, hints_used: 1, moves: 6 }]
  ]);

  journey.start({ difficulty: "expert", source: "import" });
  journey.recordMove(1);
  assert.deepEqual(events.at(-2), ["puzzle_started", { difficulty: "expert", source: "import" }]);
  assert.deepEqual(events.at(-1), ["puzzle_first_move", { difficulty: "expert", source: "import" }]);
}

console.log("product analytics tests passed");
