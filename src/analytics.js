function postHogUiHost(apiHost) {
  return apiHost.includes("eu.i.posthog.com") ? "https://eu.posthog.com" : "https://us.posthog.com";
}

function safePageUrl(value) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function safeHostname(value) {
  if (value === "$direct") return value;
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname || undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeAnalyticsEvent(event) {
  if (!event?.properties) return event;
  const properties = sanitizeUrlProperties(event.properties);
  return { ...event, properties };
}

function sanitizeUrlProperties(source) {
  const properties = { ...source };
  const currentUrl = safePageUrl(properties.$current_url);
  const initialUrl = safePageUrl(properties.$initial_current_url);
  const sessionEntryUrl = safePageUrl(properties.$session_entry_url);

  if (currentUrl) properties.$current_url = currentUrl;
  else delete properties.$current_url;
  if (initialUrl) properties.$initial_current_url = initialUrl;
  else delete properties.$initial_current_url;
  if (sessionEntryUrl) properties.$session_entry_url = sessionEntryUrl;
  else delete properties.$session_entry_url;

  delete properties.$referrer;
  delete properties.$initial_referrer;
  delete properties.$session_entry_referrer;
  delete properties.$raw_user_agent;

  for (const name of ["$referring_domain", "$initial_referring_domain", "$session_entry_referring_domain"]) {
    const hostname = safeHostname(properties[name]);
    if (hostname) properties[name] = hostname;
    else delete properties[name];
  }

  if (properties.$set && typeof properties.$set === "object") {
    properties.$set = sanitizeUrlProperties(properties.$set);
  }
  if (properties.$set_once && typeof properties.$set_once === "object") {
    properties.$set_once = sanitizeUrlProperties(properties.$set_once);
  }

  return properties;
}

export function createProductAnalytics({ client, key, host }) {
  let enabled = false;

  return {
    init() {
      if (!key || !client?.init) return false;
      try {
        client.init(key, {
          api_host: host,
          ui_host: postHogUiHost(host),
          autocapture: false,
          capture_pageview: true,
          capture_pageleave: true,
          before_send: sanitizeAnalyticsEvent,
          persistence: "localStorage",
          person_profiles: "never",
          disable_session_recording: true,
          disable_external_dependency_loading: true,
          advanced_disable_flags: false,
          advanced_disable_feature_flags: false,
          capture_heatmaps: false,
          enable_heatmaps: false,
          capture_performance: true,
          capture_dead_clicks: false,
          capture_exceptions: false,
          disable_surveys: true,
          enable_recording_console_log: false,
          mask_all_text: true,
          mask_all_element_attributes: true,
          mask_personal_data_properties: true,
          loaded: () => {}
        });
        enabled = true;
        return true;
      } catch {
        return false;
      }
    },

    capture(event, properties = {}) {
      if (!enabled || !client?.capture) return false;
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
  let completionCaptured = false;

  function reset(nextContext, existingMoves = 0, hasExistingProgress = existingMoves > 0) {
    context = { ...nextContext };
    startCaptured = hasExistingProgress;
    firstMoveCaptured = existingMoves > 0;
    meaningfulPlayCaptured = existingMoves >= 5;
    completionCaptured = false;
  }

  function ensureStarted() {
    if (startCaptured) return;
    startCaptured = true;
    capture("puzzle_started", context);
  }

  return {
    resume(nextContext, existingMoves = 0, hasExistingProgress = existingMoves > 0) {
      reset(nextContext, existingMoves, hasExistingProgress);
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
      if (completionCaptured) return;
      completionCaptured = true;
      ensureStarted();
      capture("puzzle_completed", { ...context, ...properties });
    }
  };
}
