import assert from "node:assert/strict";
import {
  AccountDeletionError,
  deleteAccount,
  readDeletionConfig,
  resolveAuthenticatedUser
} from "../server/account-deletion.js";
import accountDeleteHandler from "../api/account-delete.js";

const environment = {
  ACCOUNT_DATABASE_URL_UNPOOLED: "postgresql://owner:secret@db.example/sudoku?sslmode=require",
  ACCOUNT_NEON_API_KEY: "server-secret",
  ACCOUNT_NEON_BRANCH_ID: "br-test-branch",
  ACCOUNT_NEON_DATA_API_URL: "https://data.example",
  ACCOUNT_NEON_PROJECT_ID: "project-test"
};

assert.deepEqual(readDeletionConfig(environment), {
  apiKey: "server-secret",
  branchId: "br-test-branch",
  databaseUrl: "postgresql://owner:secret@db.example/sudoku?sslmode=require",
  dataApiUrl: "https://data.example",
  projectId: "project-test"
});
assert.throws(
  () => readDeletionConfig({ ...environment, ACCOUNT_NEON_API_KEY: "" }),
  (error) => error instanceof AccountDeletionError && error.status === 503
);

const verified = await resolveAuthenticatedUser({
  token: "user-jwt",
  dataApiUrl: "https://data.example/",
  fetchImpl: async (url, options) => {
    assert.equal(url, "https://data.example/rpc/account_current_user_id");
    assert.equal(options.headers.Authorization, "Bearer user-jwt");
    assert.equal(options.body, "{}");
    return new Response(JSON.stringify("user-123"), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
});
assert.equal(verified, "user-123");

await assert.rejects(
  resolveAuthenticatedUser({
    token: "expired",
    dataApiUrl: "https://data.example",
    fetchImpl: async () => new Response("", { status: 401 })
  }),
  (error) => error instanceof AccountDeletionError && error.status === 401
);

const queries = [];
const fetches = [];
const result = await deleteAccount({
  token: "valid-user-jwt",
  environment,
  createDatabaseClient() {
    return {
      async connect() { queries.push(["connect"]); },
      async query(sql, parameters) { queries.push([sql, parameters]); },
      async end() { queries.push(["end"]); }
    };
  },
  fetchImpl: async (url, options) => {
    fetches.push({ url, options });
    if (url.endsWith("/rpc/account_current_user_id")) {
      return new Response(JSON.stringify("user-123"), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(null, { status: 204 });
  }
});
assert.deepEqual(result, { deleted: true });
assert.deepEqual(
  queries.filter(([sql]) => sql?.startsWith("delete")).map(([sql, parameters]) => [sql, parameters]),
  [
    ["delete from public.technique_progress_by_device where user_id = $1", ["user-123"]],
    ["delete from public.played_puzzles where user_id = $1", ["user-123"]],
    ["delete from public.account_state where user_id = $1", ["user-123"]]
  ]
);
assert.equal(fetches[1].url, "https://console.neon.tech/api/v2/projects/project-test/branches/br-test-branch/auth/users/user-123");
assert.equal(fetches[1].options.headers.Authorization, "Bearer server-secret");

const wrongMethod = await invokeRoute({
  method: "GET",
  headers: {}
});
assert.equal(wrongMethod.status, 405);
assert.equal(wrongMethod.headers.allow, "POST");

const crossOrigin = await invokeRoute({
  method: "POST",
  headers: {
    host: "sudokupilot.com",
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site"
  },
  body: { confirmation: "DELETE" }
});
assert.equal(crossOrigin.status, 403);

const unconfirmed = await invokeRoute({
  method: "POST",
  headers: {
    host: "sudokupilot.com",
    origin: "https://sudokupilot.com",
    "sec-fetch-site": "same-origin"
  },
  body: JSON.stringify({ confirmation: "delete" })
});
assert.equal(unconfirmed.status, 400);

console.log("account deletion API tests passed");

function invokeRoute(request) {
  return new Promise((resolve) => {
    const headers = {};
    const response = {
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      end(body) {
        resolve({ status: this.statusCode, headers, body: JSON.parse(body) });
      }
    };
    accountDeleteHandler(request, response);
  });
}
