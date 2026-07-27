const DEFAULT_TIMEOUT_MS = 2500;

export function readAccountConfig(environment = import.meta.env, runtime = globalThis) {
  const override = runtime.__SUDOKU_ACCOUNT_CONFIG__ || {};
  const enabled = override.enabled ?? environment.VITE_ACCOUNT_SYNC_ENABLED === "true";
  return {
    enabled: Boolean(enabled),
    authUrl: override.authUrl || environment.ACCOUNT_VITE_NEON_AUTH_URL || environment.VITE_NEON_AUTH_URL || "",
    dataApiUrl: override.dataApiUrl || environment.VITE_NEON_DATA_API_URL || "",
    timeoutMs: Number(override.timeoutMs) || DEFAULT_TIMEOUT_MS
  };
}

export function accountConfigReady(config) {
  return Boolean(config.enabled && isHttpsOrLocalUrl(config.authUrl) && isHttpsOrLocalUrl(config.dataApiUrl));
}

export async function createAccountClient(config = readAccountConfig()) {
  if (!accountConfigReady(config)) return null;
  const { createClient, SupabaseAuthAdapter } = await withTimeout(
    import("@neondatabase/neon-js"),
    config.timeoutMs
  );
  return createClient({
    auth: {
      adapter: SupabaseAuthAdapter(),
      url: config.authUrl
    },
    dataApi: {
      url: config.dataApiUrl
    }
  });
}

export async function getAccountSession(client, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const result = await withTimeout(client.auth.getSession(), timeoutMs);
  if (result?.error) throw result.error;
  return result?.data?.session || null;
}

export async function signInWithEmail(client, email, password) {
  return unwrap(await client.auth.signInWithPassword({ email, password }));
}

export async function createEmailAccount(client, email, password) {
  return unwrap(await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: safeReturnUrl()
    }
  }));
}

export async function sendPasswordReset(client, email) {
  return unwrap(await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${globalThis.location?.origin || ""}/?account=recovery`
  }));
}

export async function verifyEmailCode(client, email, code) {
  return unwrap(await client.auth.verifyOtp({
    email,
    token: code,
    type: "signup"
  }));
}

export async function completePasswordReset(client, token, newPassword) {
  const underlying = client.auth.getBetterAuthInstance?.();
  if (!underlying?.resetPassword) throw new Error("password_reset_unavailable");
  const result = await underlying.resetPassword({ token, newPassword });
  if (result?.error) throw result.error;
  return result?.data;
}

export async function deleteAccountThroughServer(client, fetchImpl = globalThis.fetch) {
  if (!client?.auth?.getSession || typeof fetchImpl !== "function") {
    throw new Error("account_deletion_unavailable");
  }
  const sessionResult = await client.auth.getSession();
  if (sessionResult?.error) throw sessionResult.error;
  const token = sessionResult?.data?.session?.access_token;
  if (!token) throw new Error("account_deletion_unauthorized");
  const response = await fetchImpl("/api/account-delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ confirmation: "DELETE" })
  });
  if (!response.ok) {
    const error = new Error(`account_deletion_http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function classifyAccountError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (globalThis.navigator?.onLine === false || /network|fetch|timeout|offline/.test(message)) return "offline";
  if (/conflict|revision|409/.test(message)) return "conflict";
  if (/jwt|session|auth|unauthorized|forbidden|401|403/.test(message)) return "auth";
  if (/schema|relation|column|42p01/.test(message)) return "schema";
  return "provider";
}

export function genericAuthMessage(error) {
  return classifyAccountError(error) === "offline"
    ? "Connect to the internet to sign in."
    : "We couldn't complete that account request. Check your details and try again.";
}

function unwrap(result) {
  if (result?.error) throw result.error;
  return result?.data ?? result;
}

function safeReturnUrl() {
  if (!globalThis.location) return "/";
  const url = new URL(globalThis.location.href);
  url.searchParams.delete("account");
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

function isHttpsOrLocalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

async function withTimeout(promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("account_timeout")), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
