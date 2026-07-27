import { validateEvidenceEvent } from "./evidence.js";

export const CAMPAIGN_DATABASE_NAME = "sudoku-pilot-campaign";
export const CAMPAIGN_DATABASE_VERSION = 1;
export const CAMPAIGN_STORE_NAMES = Object.freeze([
  "profiles",
  "evidence_events",
  "skill_snapshots",
  "activities",
  "campaign_state",
  "entitlements"
]);

export function createMemoryCampaignStorage() {
  const stores = new Map(CAMPAIGN_STORE_NAMES.map((name) => [name, new Map()]));
  return createStorageApi({
    async put(store, key, value, { append = false } = {}) {
      const target = stores.get(store);
      if (append && target.has(serializeKey(key))) throw new Error(`Duplicate append-only key: ${key}`);
      target.set(serializeKey(key), clone(value));
    },
    async get(store, key) {
      return clone(stores.get(store).get(serializeKey(key)) ?? null);
    },
    async getAll(store) {
      return [...stores.get(store).values()].map(clone);
    },
    async delete(store, key) {
      stores.get(store).delete(serializeKey(key));
    },
    async clear(store) {
      stores.get(store).clear();
    },
    async complete({ activityId, profileId, evidenceEvents, completedAt }) {
      const activityKey = serializeKey(activityId);
      const activity = stores.get("activities").get(activityKey);
      if (!activity) throw new Error(`Unknown campaign activity: ${activityId}`);
      if (activity.completedAt) throw new Error(`Campaign activity is already completed: ${activityId}`);
      const stateKey = serializeKey(profileId);
      const state = stores.get("campaign_state").get(stateKey) || { profileId, campaignSequence: 0 };
      for (const event of evidenceEvents) {
        validateEvidenceEvent(event);
        const eventKey = serializeKey(event.eventId);
        if (stores.get("evidence_events").has(eventKey)) throw new Error(`Duplicate append-only key: ${event.eventId}`);
      }
      stores.get("activities").set(activityKey, clone({ ...activity, completedAt }));
      evidenceEvents.forEach((event) => stores.get("evidence_events").set(serializeKey(event.eventId), clone(event)));
      stores.get("campaign_state").set(stateKey, clone({
        ...state,
        currentActivityId: null,
        lastCompletedActivityId: activityId,
        campaignSequence: (state.campaignSequence || 0) + 1,
        updatedAt: completedAt
      }));
      for (const event of evidenceEvents) {
        if (event.techniqueId) stores.get("skill_snapshots").delete(serializeKey([profileId, event.techniqueId]));
      }
    }
  });
}

export async function openCampaignStorage({
  indexedDB = globalThis.indexedDB,
  databaseName = CAMPAIGN_DATABASE_NAME
} = {}) {
  if (!indexedDB) throw new Error("IndexedDB is unavailable; campaign storage cannot open.");
  const database = await openDatabase(indexedDB, databaseName);
  return createStorageApi({
    put: (store, key, value, { append = false } = {}) => idbRequest(database, store, "readwrite", (objectStore) => (
      append ? objectStore.add(clone(value)) : objectStore.put(clone(value))
    )),
    get: (store, key) => idbRequest(database, store, "readonly", (objectStore) => objectStore.get(key)),
    getAll: (store) => idbRequest(database, store, "readonly", (objectStore) => objectStore.getAll()),
    delete: (store, key) => idbRequest(database, store, "readwrite", (objectStore) => objectStore.delete(key)),
    clear: (store) => idbRequest(database, store, "readwrite", (objectStore) => objectStore.clear()),
    complete: ({ activityId, profileId, evidenceEvents, completedAt }) => completeIndexedDbActivity(
      database,
      { activityId, profileId, evidenceEvents, completedAt }
    ),
    close: () => database.close()
  });
}

function createStorageApi(adapter) {
  return Object.freeze({
    putProfile: (profile) => adapter.put("profiles", profile.id, profile),
    getProfile: (profileId = "local") => adapter.get("profiles", profileId),
    appendEvidence: (event) => {
      validateEvidenceEvent(event);
      return adapter.put("evidence_events", event.eventId, event, { append: true });
    },
    async listEvidence({ profileId = null, techniqueId = null, activityId = null } = {}) {
      const events = await adapter.getAll("evidence_events");
      return events
        .filter((event) => !profileId || event.profileId === profileId)
        .filter((event) => !techniqueId || event.techniqueId === techniqueId)
        .filter((event) => !activityId || event.activityId === activityId)
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId));
    },
    putSkillSnapshot: (snapshot) => adapter.put("skill_snapshots", [snapshot.profileId, snapshot.techniqueId], snapshot),
    getSkillSnapshot: (profileId, techniqueId) => adapter.get("skill_snapshots", [profileId, techniqueId]),
    async listSkillSnapshots(profileId = null) {
      const snapshots = await adapter.getAll("skill_snapshots");
      return snapshots.filter((snapshot) => !profileId || snapshot.profileId === profileId);
    },
    putActivity: (activity) => adapter.put("activities", activity.activityId, activity),
    getActivity: (activityId) => adapter.get("activities", activityId),
    async listActivities(profileId = null) {
      const activities = await adapter.getAll("activities");
      return activities.filter((activity) => !profileId || activity.profileId === profileId);
    },
    putCampaignState: (state) => adapter.put("campaign_state", state.profileId, state),
    getCampaignState: (profileId = "local") => adapter.get("campaign_state", profileId),
    putEntitlement: (entitlement) => adapter.put("entitlements", entitlement.profileId, entitlement),
    getEntitlement: (profileId = "local") => adapter.get("entitlements", profileId),
    completeActivity: (input) => adapter.complete(input),
    async exportData() {
      const exported = { schemaVersion: CAMPAIGN_DATABASE_VERSION };
      for (const store of CAMPAIGN_STORE_NAMES) exported[store] = await adapter.getAll(store);
      return exported;
    },
    async clearAll() {
      for (const store of CAMPAIGN_STORE_NAMES) await adapter.clear(store);
    },
    async resetProgress(profileId = "local") {
      const profile = await adapter.get("profiles", profileId);
      for (const store of ["evidence_events", "skill_snapshots", "activities", "campaign_state"]) {
        await adapter.clear(store);
      }
      if (profile) {
        await adapter.put("profiles", profileId, {
          ...profile,
          placementCompletedAt: null,
          placementSkippedAt: null,
          placementDraftReports: {},
          updatedAt: new Date().toISOString()
        });
      }
    },
    async deleteProfileData() {
      for (const store of CAMPAIGN_STORE_NAMES) await adapter.clear(store);
    },
    close: adapter.close || (() => {})
  });
}

function openDatabase(indexedDB, databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, CAMPAIGN_DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => createSchema(request.result);
    request.onsuccess = () => resolve(request.result);
  });
}

function createSchema(database) {
  if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "id" });
  if (!database.objectStoreNames.contains("evidence_events")) {
    const evidence = database.createObjectStore("evidence_events", { keyPath: "eventId" });
    evidence.createIndex("techniqueId", "techniqueId", { unique: false });
    evidence.createIndex("activityId", "activityId", { unique: false });
    evidence.createIndex("occurredAt", "occurredAt", { unique: false });
  }
  if (!database.objectStoreNames.contains("skill_snapshots")) {
    database.createObjectStore("skill_snapshots", { keyPath: ["profileId", "techniqueId"] });
  }
  if (!database.objectStoreNames.contains("activities")) database.createObjectStore("activities", { keyPath: "activityId" });
  if (!database.objectStoreNames.contains("campaign_state")) database.createObjectStore("campaign_state", { keyPath: "profileId" });
  if (!database.objectStoreNames.contains("entitlements")) database.createObjectStore("entitlements", { keyPath: "profileId" });
}

function idbRequest(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], mode);
    const request = operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(clone(request.result ?? null));
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(transaction.error || new Error("Campaign storage transaction aborted."));
  });
}

function completeIndexedDbActivity(database, { activityId, profileId, evidenceEvents, completedAt }) {
  evidenceEvents.forEach(validateEvidenceEvent);
  return new Promise((resolve, reject) => {
    let lifecycleError = null;
    const transaction = database.transaction(
      ["evidence_events", "activities", "campaign_state", "skill_snapshots"],
      "readwrite"
    );
    const evidenceStore = transaction.objectStore("evidence_events");
    const activityStore = transaction.objectStore("activities");
    const stateStore = transaction.objectStore("campaign_state");
    const snapshotStore = transaction.objectStore("skill_snapshots");
    const activityRequest = activityStore.get(activityId);
    const stateRequest = stateStore.get(profileId);

    activityRequest.onsuccess = () => {
      if (!activityRequest.result) {
        lifecycleError = new Error(`Unknown campaign activity: ${activityId}`);
        transaction.abort();
        return;
      }
      if (activityRequest.result.completedAt) {
        lifecycleError = new Error(`Campaign activity is already completed: ${activityId}`);
        transaction.abort();
        return;
      }
      activityStore.put({ ...activityRequest.result, completedAt });
      evidenceEvents.forEach((event) => {
        evidenceStore.add(clone(event));
        if (event.techniqueId) snapshotStore.delete([profileId, event.techniqueId]);
      });
    };
    stateRequest.onsuccess = () => {
      const state = stateRequest.result || { profileId, campaignSequence: 0 };
      stateStore.put({
        ...state,
        currentActivityId: null,
        lastCompletedActivityId: activityId,
        campaignSequence: (state.campaignSequence || 0) + 1,
        updatedAt: completedAt
      });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(lifecycleError || transaction.error || new Error(`Campaign activity completion failed: ${activityId}`));
  });
}

function serializeKey(value) {
  return JSON.stringify(value);
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
