import pg from "pg";

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/;
const OWNED_TABLES = [
  "technique_progress_by_device",
  "played_puzzles",
  "account_state"
];

export class AccountDeletionError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.name = "AccountDeletionError";
    this.code = code;
    this.status = status;
  }
}

export async function deleteAccount({
  token,
  environment = process.env,
  fetchImpl = globalThis.fetch,
  createDatabaseClient = defaultDatabaseClient
}) {
  const config = readDeletionConfig(environment);
  const userId = await resolveAuthenticatedUser({
    token,
    dataApiUrl: config.dataApiUrl,
    fetchImpl
  });

  await deleteOwnedRows({
    userId,
    databaseUrl: config.databaseUrl,
    createDatabaseClient
  });

  const authResponse = await fetchImpl(
    `https://console.neon.tech/api/v2/projects/${config.projectId}/branches/${config.branchId}/auth/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`
      }
    }
  );
  if (![204, 404].includes(authResponse.status)) {
    throw new AccountDeletionError("auth_user_delete_failed", 502);
  }

  return { deleted: true };
}

export function readDeletionConfig(environment) {
  const config = {
    apiKey: environment.ACCOUNT_NEON_API_KEY || "",
    branchId: environment.ACCOUNT_NEON_BRANCH_ID || "",
    databaseUrl: environment.ACCOUNT_DATABASE_URL_UNPOOLED || "",
    dataApiUrl: environment.ACCOUNT_NEON_DATA_API_URL || environment.VITE_NEON_DATA_API_URL || "",
    projectId: environment.ACCOUNT_NEON_PROJECT_ID || ""
  };
  if (
    !config.apiKey
    || !PROJECT_ID_PATTERN.test(config.branchId)
    || !PROJECT_ID_PATTERN.test(config.projectId)
    || !isUrl(config.dataApiUrl, ["https:"])
    || !isUrl(config.databaseUrl, ["postgres:", "postgresql:"])
  ) {
    throw new AccountDeletionError("account_deletion_not_configured", 503);
  }
  return config;
}

export async function resolveAuthenticatedUser({ token, dataApiUrl, fetchImpl = globalThis.fetch }) {
  if (!token || typeof fetchImpl !== "function") {
    throw new AccountDeletionError("account_deletion_unauthorized", 401);
  }
  const response = await fetchImpl(`${dataApiUrl.replace(/\/+$/, "")}/rpc/account_current_user_id`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  if ([401, 403].includes(response.status)) {
    throw new AccountDeletionError("account_deletion_unauthorized", 401);
  }
  if (!response.ok) {
    throw new AccountDeletionError("account_identity_check_failed", 502);
  }
  const body = await response.json();
  const userId = typeof body === "string" ? body : body?.account_current_user_id;
  if (!USER_ID_PATTERN.test(userId || "")) {
    throw new AccountDeletionError("account_identity_check_failed", 502);
  }
  return userId;
}

async function deleteOwnedRows({ userId, databaseUrl, createDatabaseClient }) {
  const client = createDatabaseClient(databaseUrl);
  try {
    await client.connect();
    await client.query("begin");
    for (const table of OWNED_TABLES) {
      await client.query(`delete from public.${table} where user_id = $1`, [userId]);
    }
    await client.query("commit");
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original database error.
    }
    throw new AccountDeletionError("account_data_delete_failed", 502);
  } finally {
    await client.end();
  }
}

function defaultDatabaseClient(connectionString) {
  return new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
}

function isUrl(value, protocols) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
