import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ACCOUNT_SCHEMA_VERSION,
  accountUserChanged,
  mergeAccountSnapshots,
  mergePlayedIds,
  mergeTechniqueRows,
  normalizeSnapshot
} from "../src/accountSync.js";
import {
  accountConfigReady,
  classifyAccountError,
  readAccountConfig,
  verifyEmailCode
} from "../src/accountClient.js";

assert.deepEqual(mergePlayedIds(["b", "a", "a"], ["c", "b"]), ["a", "b", "c"]);

const techniqueRows = mergeTechniqueRows(
  [{ device_id: "device-a", technique_id: "X-Wing", opportunities: 4, hint_applies: 1 }],
  [{ device_id: "device-a", technique_id: "X-Wing", opportunities: 3, hint_applies: 2 }]
);
assert.deepEqual(techniqueRows, [{
  device_id: "device-a",
  technique_id: "X-Wing",
  opportunities: 4,
  independent_successes: 0,
  assisted_successes: 0,
  hint_reveals: 0,
  hint_applies: 2,
  practice_completions: 0
}]);

const local = {
  schemaVersion: ACCOUNT_SCHEMA_VERSION,
  activePuzzle: { puzzle: { givens: [1] }, puzzleMoveCount: 0 },
  preferences: { showTimer: false },
  playedIds: ["local"],
  legacyCompletedCount: 2,
  techniqueRows: []
};
const cloud = {
  schemaVersion: ACCOUNT_SCHEMA_VERSION,
  activePuzzle: { puzzle: { givens: [2] }, puzzleMoveCount: 3 },
  preferences: { showTimer: true },
  playedIds: ["cloud"],
  legacyCompletedCount: 1,
  techniqueRows: []
};
const uncomplicated = mergeAccountSnapshots(local, cloud);
assert.equal(uncomplicated.conflict, null);
assert.equal(uncomplicated.merged.activePuzzle.puzzleMoveCount, 3);
assert.deepEqual(uncomplicated.merged.preferences, { showTimer: true });
assert.deepEqual(uncomplicated.merged.playedIds, ["cloud", "local"]);
assert.equal(uncomplicated.merged.legacyCompletedCount, 2);

const conflict = mergeAccountSnapshots(
  { ...local, activePuzzle: { puzzle: { givens: [1] }, puzzleMoveCount: 2 } },
  cloud
);
assert.ok(conflict.conflict);
assert.equal(conflict.merged, null);

assert.throws(() => normalizeSnapshot({ schemaVersion: ACCOUNT_SCHEMA_VERSION + 1 }), /account_schema_future/);
assert.equal(accountUserChanged(null, { user: { id: "user-a" } }), true);
assert.equal(accountUserChanged({ user: { id: "user-a" } }, { user: { id: "user-a" } }), false);
assert.equal(accountUserChanged({ user: { id: "user-a" } }, { user: { id: "user-b" } }), true);

const disabled = readAccountConfig({
  VITE_ACCOUNT_SYNC_ENABLED: "false",
  VITE_NEON_AUTH_URL: "https://auth.example",
  VITE_NEON_DATA_API_URL: "https://data.example"
}, {});
assert.equal(disabled.enabled, false);
assert.equal(accountConfigReady(disabled), false);

const configured = readAccountConfig({}, {
  __SUDOKU_ACCOUNT_CONFIG__: {
    enabled: true,
    authUrl: "https://auth.example",
    dataApiUrl: "https://data.example"
  }
});
assert.equal(accountConfigReady(configured), true);
assert.equal(classifyAccountError(new Error("Failed to fetch")), "offline");
assert.equal(classifyAccountError(new Error("revision conflict")), "conflict");

let verifyOtpRequest;
const verifiedUser = { id: "test-user" };
const verified = await verifyEmailCode({
  auth: {
    async verifyOtp(request) {
      verifyOtpRequest = request;
      return { data: { user: verifiedUser }, error: null };
    }
  }
}, "player@example.com", "123456");
assert.deepEqual(verifyOtpRequest, {
  email: "player@example.com",
  token: "123456",
  type: "signup"
});
assert.deepEqual(verified, { user: verifiedUser });

const sql = await readFile(new URL("../database/account/001_account_sync.sql", import.meta.url), "utf8");
for (const table of ["account_state", "played_puzzles", "technique_progress_by_device"]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anonymous`));
}
assert.equal((sql.match(/to authenticated/g) || []).length, 15);
assert.equal((sql.match(/using \(\(select auth\.user_id\(\)\) = user_id\)/g) || []).length, 9);
assert.equal((sql.match(/with check \(\(select auth\.user_id\(\)\) = user_id\)/g) || []).length, 6);

console.log("account sync tests passed");
