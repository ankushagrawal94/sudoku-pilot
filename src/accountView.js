export function renderAccountPanel(model) {
  if (!model.enabled) return "";
  if (!model.configured) {
    return `
      <section class="sub-panel account-panel" data-testid="account-panel">
        <h2>Play on every device</h2>
        <p class="caption">Account sync is not available in this build. Sudoku Pilot still works without an account.</p>
      </section>
    `;
  }
  if (!model.session) {
    return `
      <section class="sub-panel account-panel" data-testid="account-panel">
        <h2>Play on every device</h2>
        <p>Sign in to sync progress, avoid repeated puzzles, and keep your learning history.</p>
        <button class="primary" data-account-action="open">Sign in</button>
        <p class="caption">Optional. Sudoku Pilot still works without an account.</p>
      </section>
    `;
  }
  const identity = escapeHtml(model.name || model.email);
  return `
    <section class="sub-panel account-panel" data-testid="account-panel">
      <div class="panel-title">
        <div><h2>Account</h2><p class="account-identity">${identity}</p></div>
        <span class="sync-status" data-testid="account-sync-status">${statusLabel(model.status)}</span>
      </div>
      ${model.status === "consent" || model.status === "local_only" ? `
        <button class="primary" data-account-action="open-consent">${model.status === "consent" ? "Choose sync settings" : "Turn on sync"}</button>
      ` : ""}
      <div class="action-stack">
        <button data-account-action="sync">Sync now</button>
        <button data-account-action="export">Export my data</button>
        <button data-account-action="sign-out">Sign out</button>
        <button class="danger-button" data-account-action="delete-mode">Delete account</button>
      </div>
    </section>
  `;
}

export function renderAccountDialog(model) {
  if (!model.enabled || !model.surfaceOpen) return "";
  let content;
  if (model.confirmSignOut) content = renderSignOutConfirmation();
  else if (model.pendingConflict) content = renderConflict(model.pendingConflict);
  else if (model.mode === "consent" || model.status === "consent") content = renderConsent();
  else if (model.mode === "delete") content = renderDelete(model);
  else content = renderAuth(model);
  return `
    <div class="account-dialog-backdrop">
      <section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" data-testid="account-dialog">
        <button class="account-dialog-close" data-account-action="close" aria-label="Close account dialog">×</button>
        ${content}
      </section>
    </div>
  `;
}

export function bindAccountViewEvents({ root, controller, onChange }) {
  root.querySelectorAll("[data-account-action]").forEach((element) => {
    element.addEventListener("click", async () => {
      const action = element.dataset.accountAction;
      if (action === "open") controller.openSurface();
      if (action === "close") controller.closeSurface();
      if (action === "create-mode") controller.setMode("create");
      if (action === "sign-in-mode") controller.setMode("sign_in");
      if (action === "reset-mode") controller.setMode("reset");
      if (action === "open-consent") {
        controller.setMode("consent");
        controller.openSurface("consent");
      }
      if (action === "delete-mode") {
        controller.setMode("delete");
        controller.openSurface("delete");
      }
      if (action === "sync") await controller.syncNow();
      if (action === "export") await controller.exportData();
      if (action === "sign-out") controller.requestSignOut();
      if (action === "sign-out-sync") await controller.signOut(true);
      if (action === "sign-out-discard") await controller.signOut(false);
      if (action === "consent-merge") await controller.selectConsent(true);
      if (action === "consent-later") await controller.selectConsent(false);
      if (action === "choose-local") await controller.resolveConflict("local");
      if (action === "choose-cloud") await controller.resolveConflict("cloud");
      onChange();
    });
  });
  root.querySelector("[data-account-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const mode = event.currentTarget.dataset.accountForm;
    if (mode === "reset") await controller.reset(String(data.get("email") || ""));
    else if (mode === "verify") await controller.verify(String(data.get("email") || ""), String(data.get("code") || ""));
    else if (mode === "new_password") await controller.finishPasswordReset(String(data.get("password") || ""));
    else await controller.submitEmail({
      email: String(data.get("email") || ""),
      password: String(data.get("password") || ""),
      create: mode === "create"
    });
    onChange();
  });
  root.querySelector("[data-account-delete-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await controller.deleteAccount(String(data.get("confirmation") || ""));
    onChange();
  });
  const dialog = root.querySelector("[data-testid='account-dialog']");
  dialog?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      controller.closeSurface();
      onChange();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href]")]
      .filter((element) => !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function renderAuth(model) {
  const create = model.mode === "create";
  const reset = model.mode === "reset";
  const verify = model.mode === "verify";
  const newPassword = model.mode === "new_password";
  return `
    <h2 id="account-dialog-title">${newPassword ? "Choose a new password" : verify ? "Confirm your email" : reset ? "Reset password" : create ? "Create an account" : "Sign in"}</h2>
    <p>${newPassword ? "Use at least eight characters." : verify ? "Enter the confirmation code sent to your email." : reset ? "We'll send a recovery message if an account matches this email." : "Sync your Sudoku progress across devices."}</p>
    <form class="account-form" data-account-form="${newPassword ? "new_password" : verify ? "verify" : reset ? "reset" : create ? "create" : "sign_in"}">
      ${newPassword ? "" : `
        <label>Email
          <input name="email" type="email" autocomplete="email" required />
        </label>
      `}
      ${verify ? `
        <label>Confirmation code
          <input name="code" inputmode="numeric" autocomplete="one-time-code" required />
        </label>
      ` : reset ? "" : `
        <label>Password
          <input name="password" type="password" autocomplete="${create || newPassword ? "new-password" : "current-password"}" minlength="8" required />
        </label>
      `}
      ${create ? `
        <label class="account-consent"><input type="checkbox" required /> I accept the <a href="/privacy/" target="_blank">Privacy Policy</a> and usage terms.</label>
      ` : ""}
      ${model.error ? `<p class="account-error" role="alert">${escapeHtml(model.error)}</p>` : ""}
      ${model.notice ? `<p class="account-notice" role="status">${escapeHtml(model.notice)}</p>` : ""}
      <button class="primary wide" type="submit">${newPassword ? "Update password" : verify ? "Confirm email" : reset ? "Send recovery email" : create ? "Create account" : "Sign in"}</button>
    </form>
    <div class="account-links">
      ${reset || create || verify || newPassword ? `<button class="link-button" data-account-action="sign-in-mode">Back to sign in</button>` : `
        <button class="link-button" data-account-action="create-mode">Create an account</button>
        <button class="link-button" data-account-action="reset-mode">Forgot password?</button>
      `}
    </div>
  `;
}

function renderConsent() {
  return `
    <h2 id="account-dialog-title">Sync this browser's Sudoku data?</h2>
    <p>We'll add your played puzzles, progress, settings, and learning history to your account. Imported screenshots are not uploaded.</p>
    <div class="action-stack">
      <button class="primary" data-account-action="consent-merge">Merge and sync</button>
      <button data-account-action="consent-later">Not now</button>
    </div>
  `;
}

function renderConflict(conflict) {
  return `
    <h2 id="account-dialog-title">Choose which puzzle to continue</h2>
    <p>Both this browser and your account have progress. The puzzle you don't choose will remain preserved on this device.</p>
    <div class="account-conflict-grid">
      <button data-account-action="choose-local"><strong>This browser</strong><span>${puzzleSummary(conflict.local.activePuzzle)}</span></button>
      <button data-account-action="choose-cloud"><strong>Your account</strong><span>${puzzleSummary(conflict.cloud.activePuzzle)}</span></button>
    </div>
  `;
}

function renderSignOutConfirmation() {
  return `
    <h2 id="account-dialog-title">Unsynced changes</h2>
    <p>This browser has account changes that have not reached Neon yet.</p>
    <div class="action-stack">
      <button class="primary" data-account-action="sign-out-sync">Sync and sign out</button>
      <button data-account-action="sign-out-discard">Discard unsynced account changes and sign out</button>
      <button data-account-action="close">Cancel</button>
    </div>
  `;
}

function renderDelete(model) {
  return `
    <h2 id="account-dialog-title">Delete account</h2>
    <p>This permanently deletes your Sudoku account data and login. Type <strong>DELETE</strong> to confirm.</p>
    <form class="account-form" data-account-delete-form>
      <label>Confirmation
        <input name="confirmation" autocomplete="off" pattern="DELETE" required />
      </label>
      ${model.error ? `<p class="account-error" role="alert">${escapeHtml(model.error)}</p>` : ""}
      <button class="danger-button wide" type="submit" ${model.deleting ? "disabled" : ""}>${model.deleting ? "Deleting…" : "Delete account permanently"}</button>
    </form>
  `;
}

function statusLabel(status) {
  return {
    saving: "Saving…",
    synced: "Synced",
    offline: "Offline — saved on this device",
    attention: "Needs attention",
    consent: "Sync not set up",
    local_only: "Local only"
  }[status] || "Signed in";
}

function puzzleSummary(puzzle) {
  const difficulty = escapeHtml(puzzle?.difficulty || "Sudoku");
  const moves = Math.max(0, Number(puzzle?.puzzleMoveCount) || 0);
  return `${difficulty} · ${moves} move${moves === 1 ? "" : "s"}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
