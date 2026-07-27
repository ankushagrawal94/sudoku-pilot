# Optional Login and Account Sync Specification v0.2

- **Status:** Implemented behind a default-off feature flag; production acceptance pending
- **Updated:** 2026-07-26
- **Backlog:** [Optional login](todo.md#product-opportunities)

## Summary

Sudoku Pilot will continue to work without an account. A player may optionally create an account or sign in to:

1. avoid receiving a shipped puzzle they have already played, even on another device;
2. resume the current puzzle and keep preferences in sync across devices;
3. retain the learning signals that will power technique mastery and personalized daily puzzles.

Version 1 uses a dedicated Sudoku Pilot Neon project for Neon Auth and account data. It reuses Sudoku Pilot's existing Neon/Vercel operational conventions, the product-isolation and live auth-test lessons proven in Personal Agent Platform, and Neon's official Vite client patterns. It does not share the private puzzle warehouse project, Personal Agent's Auth tenant, Google OAuth credentials, database, or user records.

The two sign-in methods are:

- **Email and password.** The email address is the account's username in v1. Arbitrary public usernames and handles are out of scope.
- **Continue with Google.**

The app must never build or store its own password system.

## Implementation status

The implementation is present on `codex/login-feature-spec` and remains disabled in Production and Preview:

- a dedicated Free-plan Neon project named `sudoku-account-sync` owns Auth, Data API, and account tables;
- `@neondatabase/neon-js` is pinned exactly to `0.6.2-beta`;
- the More-panel account surface, email/password, email verification code, password recovery completion, Google redirect, session restore, consent, offline dirty state, merge/conflict handling, export, sign-out, and deletion flows are implemented;
- `database/account/001_account_sync.sql` has been applied to the dedicated project, with RLS and owner-only policies on every exposed table;
- unit, security, and intercepted desktop/mobile browser tests run in the default repository suite;
- Production and Preview keep `VITE_ACCOUNT_SYNC_ENABLED=false`; local Development is enabled for acceptance work.

Public enablement is intentionally blocked until all Phase 0 live tests pass. Remaining provider work includes a Sudoku-specific Google OAuth client, a Sudoku-specific production email sender, abuse controls, Data API Advisor review, branch-matched Preview Auth/Data API URLs, two-user RLS negatives, same-email identity behavior, and live email/password plus Google export/deletion tests. Neon Auth and the pinned browser SDK are beta, and the SDK dependency tree's current security advisories require provider clarification or a safe patched pin before launch.

## Product principles

- **Guest play remains first class.** Playing, importing, coaching, learning, practicing, installing the PWA, and using it offline do not require an account.
- **No launch interruption.** Do not show a sign-in wall, automatic modal, or repeated account prompt.
- **An account has a concrete benefit.** Account copy should lead with cross-device progress, no repeated catalog puzzles, and retained learning history.
- **Local first, cloud backed.** A signed-in player keeps playing when offline. Local saves remain immediate; cloud sync happens when a connection is available.
- **No silent data loss.** First sign-in merges safe sets and asks the player to choose when two in-progress puzzles conflict.
- **Private by default.** There are no profiles, public usernames, leaderboards, friends, or sharing in v1.
- **Product isolation.** Reuse implementation patterns and provider organizations where sensible, but use Sudoku-specific projects, keys, OAuth configuration, sender identity, data, and budgets.
- **Free-plan constrained.** Account sync launches only while it fits Neon's Free plan. There is no automatic paid upgrade or overage authorization; guest play remains available if a provider limit is approached or reached.

## Goals and success criteria

### Goal 1: simple optional authentication

A player can create an account, sign in, restore a session, reset a password, and sign out with email/password or Google.

Success means:

- both methods work on the production domain and an approved localhost callback;
- the same verified email cannot accidentally create two independent Sudoku histories;
- a returning session restores without blocking app startup;
- auth or network failure never prevents guest play.

### Goal 2: never repeat a shipped puzzle across devices

Every generated catalog puzzle has a canonical ID. While signed in, the app syncs the set of canonical IDs the player has started. Puzzle generation excludes the union of local and cloud IDs.

Success means a puzzle started on device A is excluded when device B requests its next puzzle after syncing. When the current difficulty's catalog is exhausted, the app explains that all available puzzles at that level have been played and offers an explicit reset or replay; it does not silently forget history.

### Goal 3: cross-device continuity

The account syncs:

- the current puzzle, values, notes, bounded undo history, timer state, hint state, and practice context;
- input, highlight, timer, mistake-checking, difficulty, technique, and practice preferences;
- played canonical puzzle IDs;
- completion totals and bounded technique-learning aggregates.

Success means a player can make progress on device A, open device B, and deliberately resume the newer state without losing either device's in-progress puzzle during a conflict.

### Goal 4: enable personalized learning

The login feature stores the minimum aggregate signals needed for later mastery and daily-puzzle logic. It does not claim that a technique is mastered until a separate, tested scoring rule defines that label.

Signals may include, per technique:

- opportunities encountered;
- independent successes;
- assisted successes;
- hint reveals or applies;
- completed targeted-practice attempts.

The daily personalized puzzle feature owns selection rules and mastery thresholds. This feature owns durable identity, collection consent, and cross-device aggregation.

## Non-goals

- Mandatory accounts or an auth-protected game.
- Arbitrary usernames, public profiles, avatars managed by Sudoku Pilot, social features, or leaderboards.
- Organizations, roles, subscriptions, payments, or administrative user management.
- Syncing imported screenshot image bytes, OCR payloads, PostHog identifiers, console logs, or raw move-by-move histories.
- Recovering browser data that was cleared before the player created an account.
- Replacing the private Neon puzzle warehouse. Catalog operations remain separate from public account data.
- Shipping personalized daily-puzzle ranking in the login release.
- Writing a custom password database, password hashing service, OAuth proxy, or token format.

## User experience

### Entry point

Add an **Account** row to the existing More panel.

Signed out:

- Heading: **Play on every device**
- Supporting copy: **Sign in to sync progress, avoid repeated puzzles, and keep your learning history.**
- Action: **Sign in**
- Secondary reassurance: **Optional. Sudoku Pilot still works without an account.**

Signed in:

- display the verified email address or Google-provided name;
- display sync state: **Synced**, **Saving…**, **Offline — saved on this device**, or **Needs attention**;
- actions: **Sync now**, **Export my data**, **Sign out**, and **Delete account**.

Do not place a sign-in prompt over the board. A small signed-in/sync indicator may be added later only if user testing shows that the More-panel status is too hidden.

### Sign-in surface

Use an accessible modal or full-height mobile sheet with:

1. **Continue with Google**
2. a visible “or” separator
3. an **Email** field
4. a **Password** field
5. primary **Sign in** action
6. **Create an account** and **Forgot password?** links

Requirements:

- label the identifier **Email**, not **Username**, because arbitrary usernames are not supported;
- support password managers and browser autofill;
- keep the player's current route and puzzle intact if the surface is dismissed;
- return an OAuth user to the same app view after a successful redirect;
- use generic credential errors that do not reveal whether an account exists;
- never send an email address, name, access token, or Neon Auth user ID to PostHog.

### Account creation

Email/password creation requires:

- a valid email address;
- a password meeting the configured policy;
- acceptance of the Privacy Policy and Terms/usage notice;
- email confirmation before cloud data becomes authoritative.

Google creation uses the provider's verified identity and the same consent copy. If a password account and Google identity use the same verified email, the integration must pass an identity-linking test before launch. If safe linking is not confirmed, the app must stop and guide the player to sign in with the original method rather than creating a duplicate history.

### Password recovery

**Forgot password?** sends a time-limited recovery link through the configured Sudoku Pilot transactional email sender. The callback returns to Sudoku Pilot, lets the player set a new password, invalidates or rotates the relevant session according to provider behavior, and shows a clear completion state.

Password login may not launch publicly until signup confirmation and recovery emails are deliverable to non-team addresses from a Sudoku-specific sender.

### First sign-in and migration

After the first successful sign-in on a browser that has local data, show one concise confirmation:

> Sync this browser's Sudoku data?
>
> We'll add your played puzzles, progress, settings, and learning history to your account. Imported screenshots are not uploaded.

Actions:

- **Merge and sync** — recommended.
- **Not now** — remain signed in but local-only until the player opts in from Account.

Merge rules:

| Data | Rule |
| --- | --- |
| Played canonical IDs | Set union. Never delete either side automatically. |
| Technique aggregates | Merge monotonic counters by device, then sum across devices. |
| Completion totals | Preserve the greatest migrated legacy count, then add only idempotent future completion records. |
| Preferences | On a new account, local wins. On an existing account, cloud wins initially and later local edits sync normally. |
| Current puzzle | If only one side has meaningful progress, keep it. If both do, show puzzle summaries and ask which one to make current. Preserve the unchosen puzzle locally until the choice is confirmed and synced. |

Migration is idempotent. Repeating it must not double counts or duplicate history.

### Offline behavior

- A guest behaves exactly as today.
- A previously signed-in player can continue using cached account data offline.
- Auth initialization has a short timeout and never blocks initial render.
- Local changes are marked dirty and retried when the app regains connectivity or next opens.
- Starting a new puzzle while offline uses all locally cached played IDs. The app must not promise that another offline device cannot independently select the same puzzle before both devices sync.
- Starting a brand-new sign-in or password reset while offline shows **Connect to the internet to sign in** without changing the current puzzle.

### Sign out

Sign out revokes the provider session and removes account-backed puzzle and learning caches from that browser after cloud sync succeeds. Non-sensitive UI preferences may remain.

If unsynced changes exist, show:

- **Sync and sign out**
- **Discard unsynced account changes and sign out**
- **Cancel**

The discard action states exactly what will be lost. It does not delete cloud data.

### Export and deletion

**Export my data** downloads a machine-readable JSON file containing the player's account state, played IDs, completion summary, and technique aggregates. It excludes provider secrets and internal auth records.

**Delete account** requires recent authentication and a typed or explicit destructive confirmation. It:

1. deletes Sudoku-owned rows;
2. revokes sessions and deletes the Neon Auth user through the provider-supported recent-authentication flow, using a server-only endpoint if privileged cleanup is required;
3. clears account caches on the device;
4. returns the app to a fresh guest state;
5. confirms that the action is complete.

Deletion must be tested with both email/password and Google accounts. Any privileged deletion credential is never exposed to the browser.

## Technical decision

### Provider: dedicated Neon Auth

Use Neon Auth, Neon Postgres, and the Neon Data API for the account boundary.

Why:

- Neon keeps Auth users, sessions, configuration, and application data in one branchable Postgres project.
- Neon Auth supports email/password and Google OAuth, and its Data API validates Neon Auth JWTs for Postgres row-level security without a custom auth server.
- Neon and Vercel can provision isolated Auth and data endpoints for preview branches.
- Sudoku Pilot already operates a Neon resource through Vercel Marketplace, so provider setup, environment naming, database migrations, and usage monitoring are familiar.
- The current Free plan is sufficient for launch: $0 without a credit card, up to 60,000 Auth MAU, 100 compute-hours, and 0.5 GB storage per project as checked on 2026-07-25. These are planning limits, not a permanent product guarantee.
- The browser can remain a static Vite PWA hosted on Vercel.

Neon's current unified browser SDK, `@neondatabase/neon-js`, is still published under a beta tag (`0.6.2-beta` when this decision was recorded). Phase 0 must therefore prove the exact vanilla-JavaScript flow before implementation proceeds. Pin the exact version that passes the proof; do not accept a floating beta range.

Do not choose:

- **Hand-built auth:** creates unnecessary password, recovery, session, and OAuth security work.
- **Clerk:** capable, but introduces a new account stack and its strongest reusable components target Next.js rather than this Vite app.
- **Supabase:** the Vite integration is proven in Triptych Studio, but it adds another backend provider when current Neon Auth covers the required methods and ownership model on a free plan.
- **The private puzzle warehouse Neon project:** violates product isolation and would expose catalog infrastructure to public account traffic, Auth configuration, quotas, and incidents.

### Reusable code patterns

Reuse and adapt, rather than copy blindly:

- Sudoku Pilot's `scripts/catalog/warehouse.mjs` and `tests/warehouse.test.js`
  - reuse the established migration/test discipline and provider-neutral error handling;
  - keep account migrations and credentials separate from the catalog warehouse.
- Personal Agent Platform's Neon Auth acceptance approach
  - reuse exact trusted-origin, token/JWKS, logout, expiry, wrong-audience, and cross-user negative tests;
  - do not reuse its same-origin credential bridge, which was specific to an owner-only Python/Render architecture.
- Neon's official `neon-data-api-neon-auth` Vite application
  - start from `createClient()` in `@neondatabase/neon-js`;
  - configure browser-safe Auth and Data API URLs;
  - use `client.auth.signUp.email()`, `client.auth.signIn.email()`, `client.auth.signIn.social({ provider: "google" })`, `client.auth.getSession()`, and the SDK's supported session-change mechanism;
  - query account tables through the authenticated Data API client;
  - adapt the headless client calls to Sudoku Pilot's vanilla JavaScript UI instead of importing React components.
- Triptych Studio's browser-auth test structure
  - reuse the provider-request interception and rendered-state contract;
  - replace Supabase-specific request shapes with Neon's proven request shapes.

Create Sudoku-specific modules instead of embedding auth and sync calls throughout `src/app.js`:

- `src/accountClient.js` — configuration, Neon client creation, and auth methods;
- `src/accountSync.js` — serialization, migration, merge, dirty state, conflict handling, and retry;
- `src/accountView.js` — pure rendering helpers for signed-out, signed-in, error, and migration states.

### Configuration

Browser-safe:

```text
VITE_ACCOUNT_SYNC_ENABLED=false
VITE_NEON_AUTH_URL=
VITE_NEON_DATA_API_URL=
```

Server-only:

```text
ACCOUNT_DATABASE_URL_UNPOOLED=
```

Rules:

- default the feature flag to false until production acceptance passes;
- standardize implementation and CI on Node.js 22 or later before adding the client dependency;
- never place a database connection string, OAuth client secret, email-provider secret, or other privileged credential in a `VITE_` variable;
- use exact production and localhost redirect allowlists, never wildcards;
- add only the exact Neon Auth and Data API origins to the current CSP `connect-src`;
- use a Sudoku-specific Google OAuth client and consent-screen branding;
- use Neon's shared email service only for development; configure a Sudoku-specific sender for production password confirmation and recovery, preferably through the existing Resend organization with a dedicated scoped key and verified Sudoku Pilot domain;
- use a separate Neon project and explicit compute, storage, egress, and Auth-MAU monitoring;
- keep autoscaling capped and scale-to-zero enabled where compatible with the sync experience;
- remain on the Free plan. Adding billing details, changing to a paid plan, or enabling paid usage requires separate approval.

Verified email-provider state as of 2026-07-26:

- Resend is the canonical transactional-email path for account verification and password recovery.
- Neon Auth uses a dedicated sending-only Resend key restricted to the verified `ankushagrawal.com` domain. The key remains server-side in Neon and is never exposed through a `VITE_` variable.
- `Sudoku Pilot <sudoku@ankushagrawal.com>` is the temporary sender while the existing free Resend account's single custom-domain slot is occupied. Verification and password-recovery messages have both been delivered through this path.
- Public enablement remains blocked until `sudokupilot.com` is verified for sending and the sender is migrated to a product-domain address such as `auth@sudokupilot.com`, or a separate product decision explicitly accepts the temporary domain. This migration must not silently add billing or remove the existing verified domain.

## Data model

The implementation may refine names, but it must preserve these ownership and merge semantics.

### `account_state`

One row per user:

- `user_id text primary key default auth.user_id()`
- `schema_version integer not null`
- `revision bigint not null`
- `active_puzzle jsonb`
- `active_puzzle_updated_at timestamptz`
- `preferences jsonb not null`
- `legacy_completed_count integer not null default 0`
- `updated_at timestamptz not null`

`active_puzzle` contains the same bounded, serializable data already saved locally. It never contains imported image bytes, object URLs, provider tokens, or analytics identifiers.

Writes use optimistic concurrency on `revision`. A stale writer receives a conflict and must merge or ask the player; it must not silently overwrite a newer active puzzle.

### `played_puzzles`

- `user_id text not null default auth.user_id()`
- `canonical_id text not null`
- `first_played_at timestamptz not null`
- `completed_at timestamptz`
- primary key `(user_id, canonical_id)`

Upserts are idempotent. `first_played_at` keeps the earliest known timestamp and `completed_at` keeps a completion once present.

### `technique_progress_by_device`

- `user_id text not null default auth.user_id()`
- `device_id uuid not null`
- `technique_id text not null`
- non-negative monotonic counters for opportunities, independent successes, assisted successes, hint reveals/applies, and practice completions
- `updated_at timestamptz not null`
- primary key `(user_id, device_id, technique_id)`

Each device only raises its own counters. Account totals sum the latest row from every device, which makes retries idempotent and prevents concurrent devices from losing increments. These aggregates support personalization but are not an authorization or billing source.

### Row-level security

Every exposed table has RLS enabled before access is granted.

For select, insert, update, and delete, policies must combine `TO authenticated` with ownership:

```sql
(select auth.user_id()) = user_id
```

Update policies require both `USING` and `WITH CHECK`. Do not use user-editable metadata for authorization. Do not expose privileged views or database credentials. Run Neon Data API Advisors before release.

## Sync contract

1. Render from local state immediately.
2. Initialize Auth asynchronously.
3. If signed in and sync consent exists, fetch account rows.
4. Apply deterministic merge rules.
5. Persist the merged result locally before rendering a replacement puzzle.
6. Push idempotent sets and counters.
7. Update `account_state` with optimistic revision control.
8. Mark local data clean only after the provider confirms the write.
9. Retry with bounded exponential backoff; stop automatic retries on auth, schema, or conflict errors and show **Needs attention**.

The sync layer owns a versioned serializer. Database migrations and local-storage migrations must support at least the immediately previous schema version. Unknown future versions fail closed and leave the current local data untouched.

## Security, privacy, and abuse controls

- Configure email/password policy, leaked-password protection when available, provider rate limits, and Turnstile or hCaptcha before opening public signup.
- Use generic auth errors to reduce account enumeration.
- Require HTTPS outside localhost.
- Validate OAuth `redirectTo` against an internal allowlist; never accept a user-provided redirect.
- Verify authenticated server requests per request against the current branch's Neon Auth contract. Create request-scoped auth/data clients so no user's session can leak through a warm Vercel function.
- Keep access and refresh tokens in the provider-supported client storage only; never copy them into app state, analytics, logs, URLs controlled by Sudoku Pilot, or exported data.
- Do not call PostHog `identify` with the Neon Auth user ID by default. Account analytics remain anonymous and contain only method, outcome class, sync state, and migration result.
- Log no passwords, tokens, email addresses, puzzle notes, or imported content.
- Keep the OCR feature independent. Signing in does not automatically upload screenshots or grant higher paid-provider quotas.
- Add retention rules for deleted accounts and operational backups to the Privacy Policy.
- Provide data export and account deletion from the first public release, not as follow-up work.

Before launch, update all current copy that says Sudoku Pilot has no accounts or server-side sync. The replacement must make the distinction explicit: accounts remain optional; guest data remains local; signed-in data is stored for sync and personalization.

## Analytics

Allowed anonymous events:

- `account_surface_opened`
- `account_sign_in_started`
- `account_sign_in_completed`
- `account_sign_in_failed`
- `account_sync_consent_selected`
- `account_migration_completed`
- `account_sync_completed`
- `account_sync_failed`
- `account_conflict_shown`
- `account_export_completed`
- `account_deleted`

Allowed properties are bounded enums such as `method`, `outcome`, `error_class`, `had_local_data`, `conflict_type`, and `offline`. Never include email, name, user ID, access token, canonical puzzle contents, notes, or free-form provider errors.

## Rollout plan

### Phase 0: provider and compatibility proof

- Create a dedicated Sudoku Pilot Neon project on the Free plan. Do not reuse the private puzzle warehouse.
- Record the current Free-plan limits and configure monitoring at 80% of compute, storage, egress, and Auth-MAU allowances. Do not add a payment method for this phase.
- Build a disposable vanilla-JavaScript Vite spike using an exact pinned `@neondatabase/neon-js` beta version; do not use React-only Auth UI components.
- Configure exact production/local URLs, email/password, Google, production email delivery, abuse controls, Data API, RLS, and preview-branch integration.
- Prove real signup, email confirmation, sign-in, session restoration, token refresh, password recovery, Google sign-in, same-email identity behavior, sign-out, deletion, and Data API ownership in a non-production branch.
- Prove a Vercel preview receives its matching branch-specific Auth and Data API URLs without trusting arbitrary preview origins.
- Stop if vanilla-JavaScript session handling, identity linking, callback, email delivery, Free-plan limits, SDK stability, JWT, RLS, or deletion behavior differs from this contract. Reconsider Supabase only through a new explicit decision.

### Phase 1: auth foundation behind a flag

- Add the account client and More-panel UI.
- Keep sync off.
- Add mocked browser tests and live provider acceptance tests.
- Verify that absent configuration and provider outages leave guest play unchanged.

### Phase 2: no-repeat history and current-state sync

- Add RLS migrations and local/cloud serializers.
- Ship first-sign-in consent, deterministic migration, no-repeat union, preferences, current puzzle, offline dirty state, and conflict UI.
- Test two browsers, two users, two devices offline, stale revisions, retries, export, and deletion.

### Phase 3: learning aggregates

- Add technique counters by device.
- Verify idempotent multi-device aggregation.
- Expose the aggregate contract to the separate daily-personalization work without labeling mastery prematurely.

Each phase requires a clean commit, current-main rebase, `npm run build`, `npm test`, Neon Data API/RLS advisor checks where applicable, and live verification before enabling the next phase.

## Acceptance criteria

### Guest and offline

- [ ] A first-time visitor can play every current mode without seeing or using account UI.
- [ ] Missing Neon configuration, an auth outage, a Data API outage, or a sync outage does not delay initial render or disable guest play.
- [ ] A previously signed-in player can continue a cached puzzle offline and sees an accurate sync state.

### Authentication

- [ ] Email/password create, confirm, sign in, restore, reset, and sign out work with generic failure copy.
- [ ] Google create/sign-in returns to the prior app view.
- [ ] Same-email password and Google flows cannot create two unnoticed Sudoku histories.
- [ ] Password managers, keyboard navigation, focus trapping, error announcements, and a 320 px viewport work.

### Migration and sync

- [ ] First sign-in asks before uploading existing browser data and states what is excluded.
- [ ] Repeating migration is idempotent.
- [ ] Played-ID union prevents a device-A puzzle from being selected on device B after sync.
- [ ] Active-puzzle conflicts never silently overwrite meaningful progress.
- [ ] Preferences, current progress, completion totals, and technique counters survive a two-device round trip.
- [ ] Offline writes retry without duplicating counts.
- [ ] Catalog exhaustion is explicit and does not silently reset history.

### Security and privacy

- [ ] A user cannot read, write, or delete another user's rows in local SQL tests or live negative tests.
- [ ] No database URL, OAuth secret, email-provider secret, or privileged credential is present in browser assets, source maps, logs, or `VITE_` variables.
- [ ] OAuth redirects are allowlisted and the CSP permits only the exact required Neon Auth and Data API origins.
- [ ] Data API Advisors report no unresolved security errors, and two-user negative tests prove every ownership policy.
- [ ] Free-plan usage monitoring is active; no billing method, paid plan, or paid overage has been enabled.
- [ ] Analytics contain no account identifiers or puzzle content.
- [ ] Export and deletion pass for email/password and Google accounts.
- [ ] Privacy, account-free, About, and offline copy accurately distinguish guest-local from signed-in-cloud behavior.

## Verification plan

- Unit tests for serialization, schema migration, merge rules, revision conflicts, retry classification, and analytics redaction.
- Browser tests with intercepted Neon Auth and Data API endpoints for every auth state and failure mode.
- Branch-isolated Neon SQL/Data API tests with two users proving positive ownership and negative cross-user access for every operation.
- Two-browser end-to-end tests for no-repeat history, current-puzzle conflicts, offline edits, and eventual sync.
- Live non-production tests using real email/password and Google accounts, including recovery, refresh, sign-out, export, deletion, and same-email behavior.
- Production smoke test from the exact `origin/main` commit before the feature flag is enabled.

## Current references

- Sudoku local state and played IDs: `src/app.js`
- Sudoku security headers: `vercel.json`
- Sudoku Neon warehouse conventions: `scripts/catalog/warehouse.mjs`, `tests/warehouse.test.js`, and `resources/catalog-pipeline.md`
- Personal Agent Neon Auth acceptance: sibling repository `personal-agent-platform`, `REPORTS/R2-T8A-private-alpha-acceptance-v0.1.md`
- Triptych browser auth contract: sibling repository `triptych-studio`, `tests/e2e/supabase-auth-workspace.mjs`
- [Neon pricing and Free-plan limits](https://neon.com/pricing)
- [Neon Auth: branchable identity in Postgres](https://neon.com/blog/neon-auth-branchable-identity-in-your-database)
- [Neon Auth and Data API Vite example](https://github.com/neondatabase/neon-data-api-neon-auth)
- [Neon row-level security](https://neon.com/docs/guides/row-level-security)
- [Neon Auth SDK and Vite demo update](https://neon.com/docs/changelog/2026-01-30)
- [Neon Google OAuth provider configuration](https://neon.com/docs/changelog/2025-07-04)

## Decision log

- **2026-07-25:** Keep accounts optional and preserve guest/offline behavior.
- **2026-07-25:** Treat email as the v1 username; do not add arbitrary handles.
- **2026-07-25:** Initially selected a dedicated Supabase project based on Triptych's exact Vite integration.
- **2026-07-25:** Replaced Supabase with a dedicated Neon project after current Neon Auth review. The deciding factors are the $0 Free plan, existing Neon operations, branchable Auth/data, and lower provider sprawl; the beta vanilla-JavaScript SDK remains a Phase 0 gate.
- **2026-07-25:** Sync no-repeat history and current progress before adding mastery-driven recommendations.
- **2026-07-25:** Require consent, safe migration, export, and deletion in the first public account release.
