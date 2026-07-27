import {
  classifyAccountError,
  completePasswordReset,
  createAccountClient,
  createEmailAccount,
  deleteAccountThroughServer,
  genericAuthMessage,
  getAccountSession,
  readAccountConfig,
  sendPasswordReset,
  signInWithEmail,
  verifyEmailCode
} from "./accountClient.js";

export const ACCOUNT_SCHEMA_VERSION = 1;
const DEVICE_KEY = "sudoku-pilot-account-device-v1";
const CONSENT_KEY = "sudoku-pilot-account-consent-v1";
const DIRTY_KEY = "sudoku-pilot-account-dirty-v1";
const CACHE_KEY = "sudoku-pilot-account-cache-v1";

export function mergePlayedIds(localIds = [], cloudIds = []) {
  return [...new Set([...localIds, ...cloudIds].filter((id) => typeof id === "string"))].sort();
}

export function mergeTechniqueRows(localRows = [], cloudRows = []) {
  const rows = new Map();
  for (const row of [...cloudRows, ...localRows]) {
    if (!row?.device_id || !row?.technique_id) continue;
    const key = `${row.device_id}:${row.technique_id}`;
    const previous = rows.get(key) || {};
    rows.set(key, {
      device_id: row.device_id,
      technique_id: row.technique_id,
      opportunities: Math.max(number(previous.opportunities), number(row.opportunities)),
      independent_successes: Math.max(number(previous.independent_successes), number(row.independent_successes)),
      assisted_successes: Math.max(number(previous.assisted_successes), number(row.assisted_successes)),
      hint_reveals: Math.max(number(previous.hint_reveals), number(row.hint_reveals)),
      hint_applies: Math.max(number(previous.hint_applies), number(row.hint_applies)),
      practice_completions: Math.max(number(previous.practice_completions), number(row.practice_completions))
    });
  }
  return [...rows.values()];
}

export function mergeAccountSnapshots(local, cloud) {
  if (!cloud) return { merged: normalizeSnapshot(local), conflict: null };
  const normalizedLocal = normalizeSnapshot(local);
  const normalizedCloud = normalizeSnapshot(cloud);
  const localMeaningful = hasMeaningfulPuzzleProgress(normalizedLocal.activePuzzle);
  const cloudMeaningful = hasMeaningfulPuzzleProgress(normalizedCloud.activePuzzle);
  const differentPuzzles = puzzleIdentity(normalizedLocal.activePuzzle) !== puzzleIdentity(normalizedCloud.activePuzzle);
  if (localMeaningful && cloudMeaningful && differentPuzzles) {
    return {
      merged: null,
      conflict: {
        local: normalizedLocal,
        cloud: normalizedCloud
      }
    };
  }
  return {
    merged: {
      schemaVersion: ACCOUNT_SCHEMA_VERSION,
      activePuzzle: cloudMeaningful ? normalizedCloud.activePuzzle : normalizedLocal.activePuzzle,
      preferences: normalizedCloud.preferences,
      playedIds: mergePlayedIds(normalizedLocal.playedIds, normalizedCloud.playedIds),
      legacyCompletedCount: Math.max(normalizedLocal.legacyCompletedCount, normalizedCloud.legacyCompletedCount),
      techniqueRows: mergeTechniqueRows(normalizedLocal.techniqueRows, normalizedCloud.techniqueRows)
    },
    conflict: null
  };
}

export function normalizeSnapshot(snapshot = {}) {
  if (number(snapshot.schemaVersion || ACCOUNT_SCHEMA_VERSION) > ACCOUNT_SCHEMA_VERSION) {
    throw new Error("account_schema_future");
  }
  return {
    schemaVersion: ACCOUNT_SCHEMA_VERSION,
    activePuzzle: snapshot.activePuzzle || null,
    preferences: object(snapshot.preferences),
    playedIds: mergePlayedIds(snapshot.playedIds),
    legacyCompletedCount: number(snapshot.legacyCompletedCount),
    techniqueRows: mergeTechniqueRows(snapshot.techniqueRows)
  };
}

export function accountUserChanged(currentSession, nextSession) {
  return currentSession?.user?.id !== nextSession?.user?.id;
}

export function createAccountController({
  getLocalSnapshot,
  applySnapshot,
  clearAccountData,
  onChange = () => {},
  capture = () => {},
  storage = globalThis.localStorage,
  config = readAccountConfig()
}) {
  let client = null;
  let unsubscribe = null;
  let syncTimer = null;
  let lastLocalFingerprint = "";
  const recoveryToken = recoveryTokenFromLocation();
  let model = {
    enabled: Boolean(config.enabled),
    configured: false,
    status: "signed_out",
    session: null,
    surfaceOpen: false,
    mode: "sign_in",
    error: "",
    notice: "",
    pendingConflict: null,
    confirmSignOut: false,
    deleting: false
  };

  function emit(patch = {}) {
    model = { ...model, ...patch };
    onChange();
  }

  async function init() {
    if (!model.enabled) return;
    try {
      client = await createAccountClient(config);
      if (!client) {
        emit({ configured: false });
        return;
      }
      emit({ configured: true });
      if (recoveryToken) emit({ surfaceOpen: true, mode: "new_password" });
      const session = await getAccountSession(client, config.timeoutMs);
      await handleSession(session);
      const subscription = client.auth.onAuthStateChange?.((_event, nextSession) => {
        void handleSession(nextSession);
      });
      unsubscribe = subscription?.data?.subscription?.unsubscribe || subscription?.unsubscribe || subscription;
      globalThis.addEventListener?.("online", handleOnline);
    } catch (error) {
      emit({
        configured: true,
        status: loadCachedUser(storage) ? "offline" : "signed_out",
        error: ""
      });
    }
  }

  async function handleSession(session) {
    if (!session?.user) {
      emit({ session: null, status: "signed_out", pendingConflict: null });
      return;
    }
    const userChanged = accountUserChanged(model.session, session);
    if (!userChanged) {
      cacheUser(storage, session.user);
      emit({ session });
      return;
    }
    const consent = consentFor(storage, session.user.id);
    emit({
      session,
      status: consent ? (navigator.onLine ? "saving" : "offline") : "consent",
      error: "",
      notice: ""
    });
    cacheUser(storage, session.user);
    if (consent && userChanged) await syncNow();
  }

  function openSurface(mode = "sign_in") {
    emit({ surfaceOpen: true, mode, error: "", notice: "", confirmSignOut: false });
    capture("account_surface_opened", {});
  }

  function closeSurface() {
    emit({ surfaceOpen: false, error: "", notice: "", confirmSignOut: false });
  }

  async function submitEmail({ email, password, create = false }) {
    if (!navigator.onLine) {
      emit({ error: "Connect to the internet to sign in." });
      return;
    }
    emit({ error: "", notice: "" });
    capture("account_sign_in_started", { method: create ? "email_signup" : "email" });
    try {
      const result = create
        ? await createEmailAccount(client, email, password)
        : await signInWithEmail(client, email, password);
      capture("account_sign_in_completed", { method: create ? "email_signup" : "email" });
      if (!create && result?.session) {
        await handleSession(result.session);
      }
      if (create && !result?.session) {
        emit({ notice: "Enter the confirmation code from your email.", mode: "verify" });
      }
    } catch (error) {
      capture("account_sign_in_failed", { method: create ? "email_signup" : "email", error_class: classifyAccountError(error) });
      emit({ error: genericAuthMessage(error) });
    }
  }

  async function verify(email, code) {
    try {
      await verifyEmailCode(client, email, code);
      emit({ notice: "Email confirmed. You can now sign in.", mode: "sign_in", error: "" });
    } catch (error) {
      emit({ error: genericAuthMessage(error) });
    }
  }

  async function reset(email) {
    if (!navigator.onLine) {
      emit({ error: "Connect to the internet to reset your password." });
      return;
    }
    try {
      await sendPasswordReset(client, email);
      emit({ notice: "If an account matches that email, a recovery message is on its way.", error: "" });
    } catch (error) {
      emit({ error: genericAuthMessage(error) });
    }
  }

  async function finishPasswordReset(newPassword) {
    if (!recoveryToken) {
      emit({ error: "This recovery link is missing or has expired." });
      return;
    }
    try {
      await completePasswordReset(client, recoveryToken, newPassword);
      clearRecoveryTokenFromLocation();
      emit({ notice: "Password updated. Sign in with your new password.", mode: "sign_in", error: "" });
    } catch (error) {
      emit({ error: genericAuthMessage(error) });
    }
  }

  async function selectConsent(accepted) {
    if (!model.session?.user) return;
    setConsent(storage, model.session.user.id, accepted);
    capture("account_sync_consent_selected", { outcome: accepted ? "merge" : "not_now", had_local_data: hasLocalData(getLocalSnapshot()) });
    if (!accepted) {
      emit({ status: "local_only", surfaceOpen: false });
      return;
    }
    markDirty();
    await syncNow();
  }

  function markDirty() {
    if (!model.session?.user || !consentFor(storage, model.session.user.id)) return;
    const fingerprint = JSON.stringify(normalizeSnapshot(getLocalSnapshot()));
    if (fingerprint === lastLocalFingerprint) return;
    lastLocalFingerprint = fingerprint;
    storage?.setItem(DIRTY_KEY, "1");
    if (!navigator.onLine) {
      emit({ status: "offline" });
      return;
    }
    emit({ status: "saving" });
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), 800);
  }

  async function syncNow() {
    if (!client || !model.session?.user || !consentFor(storage, model.session.user.id)) return;
    clearTimeout(syncTimer);
    syncTimer = null;
    if (!navigator.onLine) {
      emit({ status: "offline" });
      return;
    }
    emit({ status: "saving", error: "" });
    try {
      const [stateResult, playedResult, techniqueResult] = await Promise.all([
        client.from("account_state").select("*").maybeSingle(),
        client.from("played_puzzles").select("canonical_id,first_played_at,completed_at"),
        client.from("technique_progress_by_device").select("*")
      ]);
      assertQuery(stateResult);
      assertQuery(playedResult);
      assertQuery(techniqueResult);
      const cloud = stateResult.data ? {
        schemaVersion: stateResult.data.schema_version,
        activePuzzle: stateResult.data.active_puzzle,
        preferences: stateResult.data.preferences,
        playedIds: (playedResult.data || []).map((row) => row.canonical_id),
        legacyCompletedCount: stateResult.data.legacy_completed_count,
        techniqueRows: techniqueResult.data || []
      } : null;
      const local = normalizeSnapshot(getLocalSnapshot());
      const { merged, conflict } = mergeAccountSnapshots(local, cloud);
      if (conflict) {
        emit({ status: "attention", pendingConflict: conflict, surfaceOpen: true });
        capture("account_conflict_shown", { conflict_type: "active_puzzle" });
        return;
      }
      await persistMerged(merged, stateResult.data?.revision ?? null);
      applySnapshot(merged);
      lastLocalFingerprint = JSON.stringify(normalizeSnapshot(getLocalSnapshot()));
      storage?.setItem(CACHE_KEY, JSON.stringify(merged));
      storage?.removeItem(DIRTY_KEY);
      emit({ status: "synced", pendingConflict: null, surfaceOpen: false });
      capture("account_sync_completed", { outcome: cloud ? "merge" : "initial" });
    } catch (error) {
      const errorClass = classifyAccountError(error);
      emit({ status: errorClass === "offline" ? "offline" : "attention", error: "" });
      capture("account_sync_failed", { error_class: errorClass, offline: errorClass === "offline" });
    }
  }

  async function persistMerged(snapshot, expectedRevision) {
    const deviceId = getAccountDeviceId(storage);
    const now = new Date().toISOString();
    const playedRows = snapshot.playedIds.map((canonicalId) => ({
      canonical_id: canonicalId,
      first_played_at: now
    }));
    if (playedRows.length) assertQuery(await client.from("played_puzzles").upsert(playedRows, {
      onConflict: "user_id,canonical_id",
      ignoreDuplicates: true
    }));
    const techniqueRows = snapshot.techniqueRows
      .filter((row) => row.device_id === deviceId)
      .map((row) => ({ ...row, device_id: deviceId, updated_at: now }));
    if (techniqueRows.length) assertQuery(await client.from("technique_progress_by_device").upsert(techniqueRows, {
      onConflict: "user_id,device_id,technique_id"
    }));
    const values = {
      schema_version: ACCOUNT_SCHEMA_VERSION,
      revision: (expectedRevision ?? -1) + 1,
      active_puzzle: snapshot.activePuzzle,
      active_puzzle_updated_at: now,
      preferences: snapshot.preferences,
      legacy_completed_count: snapshot.legacyCompletedCount,
      updated_at: now
    };
    if (expectedRevision === null) {
      assertQuery(await client.from("account_state").insert(values));
      return;
    }
    const result = await client.from("account_state")
      .update(values)
      .eq("revision", expectedRevision)
      .select("revision");
    assertQuery(result);
    if (!result.data?.length) throw new Error("account_revision_conflict");
  }

  async function resolveConflict(source) {
    const conflict = model.pendingConflict;
    if (!conflict) return;
    const chosen = source === "cloud" ? conflict.cloud : conflict.local;
    const other = source === "cloud" ? conflict.local : conflict.cloud;
    const merged = {
      ...chosen,
      playedIds: mergePlayedIds(chosen.playedIds, other.playedIds),
      legacyCompletedCount: Math.max(chosen.legacyCompletedCount, other.legacyCompletedCount),
      techniqueRows: mergeTechniqueRows(chosen.techniqueRows, other.techniqueRows)
    };
    applySnapshot(merged);
    storage?.setItem(`${CACHE_KEY}-preserved`, JSON.stringify(other.activePuzzle));
    emit({ pendingConflict: null, status: "saving" });
    markDirty();
    await syncNow();
  }

  async function exportData() {
    await syncNow();
    const snapshot = normalizeSnapshot(getLocalSnapshot());
    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      schemaVersion: ACCOUNT_SCHEMA_VERSION,
      accountState: {
        activePuzzle: snapshot.activePuzzle,
        preferences: snapshot.preferences,
        legacyCompletedCount: snapshot.legacyCompletedCount
      },
      playedPuzzleIds: snapshot.playedIds,
      techniqueProgress: snapshot.techniqueRows
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sudoku-pilot-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    capture("account_export_completed", {});
  }

  function requestSignOut() {
    if (storage?.getItem(DIRTY_KEY)) emit({ confirmSignOut: true, surfaceOpen: true });
    else void signOut(false);
  }

  async function signOut(syncFirst) {
    try {
      if (syncFirst) await syncNow();
      await client.auth.signOut();
    } finally {
      clearAccountCache(storage);
      emit({ session: null, status: "signed_out", surfaceOpen: false, confirmSignOut: false });
    }
  }

  async function deleteAccount(confirmation) {
    if (confirmation !== "DELETE" || !model.session?.user) return;
    emit({ deleting: true, error: "" });
    try {
      await deleteAccountThroughServer(client);
      try {
        await client.auth.signOut();
      } catch {
        // The server has already deleted the Auth user, so local cleanup must continue.
      }
      clearAccountCache(storage);
      clearAccountData();
      emit({ deleting: false, session: null, status: "signed_out", surfaceOpen: false });
      capture("account_deleted", {});
    } catch (error) {
      emit({
        deleting: false,
        error: classifyAccountError(error) === "auth"
          ? "Please sign in again before deleting your account."
          : "We couldn't finish deleting the account. No local data was cleared."
      });
    }
  }

  function handleOnline() {
    if (storage?.getItem(DIRTY_KEY)) void syncNow();
  }

  return {
    init,
    destroy() {
      clearTimeout(syncTimer);
      if (typeof unsubscribe === "function") unsubscribe();
      globalThis.removeEventListener?.("online", handleOnline);
    },
    getViewModel: () => ({ ...model, email: model.session?.user?.email || "", name: model.session?.user?.name || "" }),
    openSurface,
    closeSurface,
    setMode: (mode) => emit({ mode, error: "", notice: "" }),
    submitEmail,
    reset,
    verify,
    finishPasswordReset,
    selectConsent,
    markDirty,
    syncNow,
    resolveConflict,
    exportData,
    requestSignOut,
    signOut,
    deleteAccount
  };
}

function recoveryTokenFromLocation() {
  try {
    const url = new URL(globalThis.location?.href || "");
    return url.searchParams.get("token") || (url.searchParams.get("account") === "recovery" ? url.searchParams.get("code") : "");
  } catch {
    return "";
  }
}

function clearRecoveryTokenFromLocation() {
  try {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete("token");
    url.searchParams.delete("code");
    url.searchParams.delete("account");
    globalThis.history.replaceState(globalThis.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Password has already changed; URL cleanup is best effort.
  }
}

function hasMeaningfulPuzzleProgress(puzzle) {
  return number(puzzle?.puzzleMoveCount) > 0 || number(puzzle?.hintCount) > 0 || Boolean(puzzle?.completionRecorded);
}

function puzzleIdentity(puzzle) {
  return JSON.stringify(puzzle?.puzzle?.givens || puzzle?.puzzle?.solution || null);
}

function hasLocalData(snapshot) {
  return Boolean(snapshot?.playedIds?.length || snapshot?.legacyCompletedCount || hasMeaningfulPuzzleProgress(snapshot?.activePuzzle));
}

function assertQuery(result) {
  if (result?.error) throw result.error;
  return result;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

export function getAccountDeviceId(storage = globalThis.localStorage) {
  let value = storage?.getItem(DEVICE_KEY);
  if (value) return value;
  value = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  storage?.setItem(DEVICE_KEY, value);
  return value;
}

function consentFor(storage, userId) {
  try {
    return JSON.parse(storage?.getItem(CONSENT_KEY) || "{}")[userId] === true;
  } catch {
    return false;
  }
}

function setConsent(storage, userId, value) {
  let all = {};
  try {
    all = JSON.parse(storage?.getItem(CONSENT_KEY) || "{}");
  } catch {
    // Replace malformed account-only metadata.
  }
  all[userId] = Boolean(value);
  storage?.setItem(CONSENT_KEY, JSON.stringify(all));
}

function cacheUser(storage, user) {
  storage?.setItem(`${CACHE_KEY}-user`, JSON.stringify({ email: user.email || "", name: user.name || "" }));
}

function loadCachedUser(storage) {
  return storage?.getItem(`${CACHE_KEY}-user`);
}

function clearAccountCache(storage) {
  storage?.removeItem(CACHE_KEY);
  storage?.removeItem(`${CACHE_KEY}-user`);
  storage?.removeItem(DIRTY_KEY);
}
