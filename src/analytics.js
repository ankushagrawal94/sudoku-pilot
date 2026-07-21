function postHogUiHost(apiHost) {
  return apiHost.includes("eu.i.posthog.com") ? "https://eu.posthog.com" : "https://us.posthog.com";
}

export function createProductAnalytics({ client, key, host, online = () => true }) {
  let enabled = false;

  return {
    init() {
      if (!key || !client?.init) return false;
      try {
        client.init(key, {
          api_host: host,
          ui_host: postHogUiHost(host),
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
          loaded: () => {}
        });
        enabled = true;
        return true;
      } catch {
        return false;
      }
    },

    capture(event, properties = {}) {
      if (!enabled || !online() || !client?.capture) return false;
      try {
        client.capture(event, properties);
        return true;
      } catch {
        return false;
      }
    },

    reset() {
      if (!enabled || !client?.reset) return false;
      try {
        client.reset();
        return true;
      } catch {
        return false;
      }
    }
  };
}

export function createPuzzleJourney(capture) {
  let context = {};
  let startCaptured = false;
  let firstMoveCaptured = false;
  let meaningfulPlayCaptured = false;

  function reset(nextContext, existingMoves = 0) {
    context = { ...nextContext };
    startCaptured = existingMoves > 0;
    firstMoveCaptured = existingMoves > 0;
    meaningfulPlayCaptured = existingMoves >= 5;
  }

  function ensureStarted() {
    if (startCaptured) return;
    startCaptured = true;
    capture("puzzle_started", context);
  }

  return {
    resume(nextContext, existingMoves = 0) {
      reset(nextContext, existingMoves);
    },

    start(nextContext) {
      reset(nextContext, 0);
      ensureStarted();
    },

    recordInteraction() {
      ensureStarted();
    },

    recordMove(moveCount) {
      if (moveCount > 0) ensureStarted();
      if (!firstMoveCaptured && moveCount > 0) {
        firstMoveCaptured = true;
        capture("puzzle_first_move", context);
      }
      if (!meaningfulPlayCaptured && moveCount >= 5) {
        meaningfulPlayCaptured = true;
        capture("puzzle_meaningful_play", { ...context, move_threshold: 5 });
      }
    },

    recordHint(properties = {}) {
      ensureStarted();
      capture("hint_requested", { ...context, ...properties });
    },

    complete(properties = {}) {
      ensureStarted();
      capture("puzzle_completed", { ...context, ...properties });
    }
  };
}
