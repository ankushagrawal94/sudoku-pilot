# Optional Login and Account Sync Specification v0.4

- **Status:** Implemented behind a default-off feature flag; production acceptance pending
- **Updated:** 2026-07-27
- **Backlog:** [Optional login](todo.md#product-opportunities)

## Summary

Sudoku Pilot will continue to work without an account. A player may optionally create an account or sign in to:

1. avoid receiving a shipped puzzle they have already played, even on another device;
2. resume the current puzzle and keep preferences in sync across devices;
3. retain the learning signals that will power technique mastery and personalized daily puzzles.

Version 1 uses a dedicated Sudoku Pilot Neon project for Neon Auth and account data. It reuses Sudoku Pilot's existing Neon/Vercel operational conventions, the product-isolation and live auth-test lessons proven in Personal Agent Platform, and Neon's official Vite client patterns. It does not share the private puzzle warehouse project, Personal Agent's Auth tenant, database, or user records.

The version 1 sign-in method is:

- **Email and password.** The email address is the account's username in v1. Arbitrary public usernames and handles are out of scope.

The app must never build or store its own password system.

## Implementation status

The implementation is merged on `main` and enabled in Production:

- a dedicated Free-plan Neon project named `sudoku-account-sync` owns Auth, Data API, and account tables;
- `@neondatabase/neon-js` is pinned exactly to `0.6.2-beta`;
- the More-panel account surface, email/password, email verification code, password recovery completion, session restore, consent, offline dirty state, merge/conflict handling, export, sign-out, and deletion confirmation UI are implemented;
- `database/account/001_account_sync.sql` and `002_account_delete.sql` have been applied to the main and PR-preview branches, with RLS and owner-only policies on every exposed table;
- account deletion now uses a same-origin Vercel Function that verifies the current JWT through the Data API, derives the user ID server-side, deletes only that user's Sudoku rows, and calls Neon's branch Auth User API with a project-scoped server key;
- unit, security, and intercepted desktop/mobile browser tests run in the default repository suite;
- Production has `VITE_ACCOUNT_SYNC_ENABLED=true`; guest play remains the default and the optional account surface stays in More.

Live email/password, email delivery, rate limiting, RLS, Data API Advisor, two-browser sync, conflict, offline retry, export, password recovery, and deployed account-deletion checks pass. One dependency advisory remains:

1. The pinned beta SDK still resolves Better Auth `1.4.18`, which is affected by the email-OTP pre-account-hijacking advisory [GHSA-qq9h-g4jm-xgf3](https://github.com/advisories/GHSA-qq9h-g4jm-xgf3). The fixed Better Auth version is `1.6.22`, but no patched `@neondatabase/neon-js` release is currently available as of 2026-07-27. The product owner accepted this advisory as a launch risk on 2026-07-27; it is tracked for a future SDK upgrade and is not a public-launch blocker.

Production is bound to Neon's main branch. PR #34's Preview environment is bound to dedicated branch `preview-login-pr-34`; its Auth, Data API, database URL, deletion branch ID, and project-scoped deletion key are scoped to `codex/login-feature-spec`. Production was enabled after the corrected public copy and final account lifecycle passed.

## Product principles

- **Guest play remains first class.** Playing, importing, coaching, learning, practicing, installing the PWA, and using it offline do not require an account.
- **No launch interruption.** Do not show a sign-in wall, automatic modal, or repeated account prompt.
- **An account has a concrete benefit.** Account copy should lead with cross-device progress, no repeated catalog puzzles, and retained learning history.
- **Local first, cloud backed.** A signed-in player keeps playing when offline. Local saves remain immediate; cloud sync happens when a connection is available.
- **No silent data loss.** First sign-in merges safe sets and asks the player to choose when two in-progress puzzles conflict.
- **Private by default.** There are no profiles, public usernames, leaderboards, friends, or sharing in v1.
- **Product isolation.** Reuse implementation patterns and provider organizations where sensible, but use Sudoku-specific projects, keys, sender identity, data, and budgets.
- **Free-plan constrained.** Account sync launches only while it fits Neon's Free plan. There is no automatic paid upgrade or overage authorization; guest play remains available if a provider limit is approached or reached.

## Goals and success criteria

### Goal 1: simple optional authentication

A player can create an account, sign in, restore a session, reset a password, and sign out with email and password.

Success means:

- the email/password lifecycle works on the production domain and an approved localhost callback;
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
- Social sign-in, including Google. It may be reconsidered only if account-conversion friction becomes a demonstrated problem.
- Syncing imported screenshot image bytes, OCR payloads, PostHog identifiers, console logs, or raw move-by-move histories.
- Recovering browser data that was cleared before the player created an account.
- Replacing the private Neon puzzle warehouse. Catalog operations remain separate from public account data.
- Shipping personalized daily-puzzle ranking in the login release.
- Writing a custom password database, password hashing service, or token format.

## User experience

### Entry point

Add an **Account** row to the existing More panel.

Signed out:

- Heading: **Play on every device**
- Supporting copy: **Sign in to sync progress, avoid repeated puzzles, and keep your learning history.**
- Action: **Sign in**
- Secondary reassurance: **Optional. Sudoku Pilot still works without an account.**

Signed in:

- display the verified email address;
- display sync state: **Synced**, **Saving…**, **Offline — saved on this device**, or **Needs attention**;
- actions: **Sync now**, **Export my data**, **Sign out**, and **Delete account**.

Do not place a sign-in prompt over the board. A small signed-in/sync indicator may be added later only if user testing shows that the More-panel status is too hidden.

### Sign-in surface

Use an accessible modal or full-height mobile sheet with:

1. an **Email** field
2. a **Password** field
3. primary **Sign in** action
4. **Create an account** and **Forgot password?** links

Requirements:

- label the identifier **Email**, not **Username**, because arbitrary usernames are not supported;
- support password managers and browser autofill;
- keep the player's current route and puzzle intact if the surface is dismissed;
- use generic credential errors that do not reveal whether an account exists;
- never send an email address, name, access token, or Neon Auth user ID to PostHog.

### Account creation

Email/password creation requires:

- a valid email address;
- a password meeting the configured policy;
- acceptance of the Privacy Policy and Terms/usage notice;
- email confirmation before cloud data becomes authoritative.

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

Deletion must be tested with an email/password account. Any privileged deletion credential is never exposed to the browser.

## Technical decision

### Provider: dedicated Neon Auth

Use Neon Auth, Neon Postgres, and the Neon Data API for the account boundary.

Why:

- Neon keeps Auth users, sessions, configuration, and application data in one branchable Postgres project.
- Neon Auth supports email/password, and its Data API validates Neon Auth JWTs for Postgres row-level security without a custom auth server.
- Neon and Vercel can provision isolated Auth and data endpoints for preview branches.
- Sudoku Pilot already operates a Neon resource through Vercel Marketplace, so provider setup, environment naming, database migrations, and usage monitoring are familiar.
- The current Free plan is sufficient for launch: $0 without a credit card, up to 60,000 Auth MAU, 100 compute-hours, and 0.5 GB storage per project as checked on 2026-07-25. These are planning limits, not a permanent product guarantee.
- The browser can remain a static Vite PWA hosted on Vercel.

Neon's current unified browser SDK, `@neondatabase/neon-js`, is still published under a beta tag (`0.6.2-beta` when this decision was recorded). Phase 0 must therefore prove the exact vanilla-JavaScript flow before implementation proceeds. Pin the exact version that passes the proof; do not accept a floating beta range.

Do not choose:

- **Hand-built auth:** creates unnecessary password, recovery, and session security work.
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
  - use the SDK's supported email/password signup, sign-in, session, verification, and recovery methods;
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
ACCOUNT_NEON_API_KEY=
ACCOUNT_NEON_BRANCH_ID=
ACCOUNT_NEON_DATA_API_URL=
ACCOUNT_NEON_PROJECT_ID=
```

Rules:

- default the feature flag to false until production acceptance passes;
- standardize implementation and CI on Node.js 22 or later before adding the client dependency;
- never place a database connection string, email-provider secret, or other privileged credential in a `VITE_` variable;
- use exact production and localhost redirect allowlists, never wildcards;
- add only the exact Neon Auth and Data API origins to the current CSP `connect-src`;
- use Neon's shared email service only for development; configure a Sudoku-specific sender for production password confirmation and recovery, preferably through the existing Resend organization with a dedicated scoped key and verified Sudoku Pilot domain;
- use a separate Neon project and explicit compute, storage, egress, and Auth-MAU monitoring;
- keep autoscaling capped and scale-to-zero enabled where compatible with the sync experience;
- remain on the Free plan. Adding billing details, changing to a paid plan, or enabling paid usage requires separate approval.

Verified email-provider state as of 2026-07-26:

- Resend is the canonical transactional-email path for account verification and password recovery.
- Neon Auth uses a dedicated sending-only Resend key restricted to the verified `ankushagrawal.com` domain. The key remains server-side in Neon and is never exposed through a `VITE_` variable.
- `Sudoku Pilot <sudoku@ankushagrawal.com>` is the temporary sender while the existing free Resend account's single custom-domain slot is occupied. Verification and password-recovery messages have both been delivered through this path.
- The product owner has accepted this temporary sender for the initial release. A future migration to `auth@sudokupilot.com` must not silently add billing or remove the existing verified domain.
- Resend sending authorization does not itself create an inbox. Cloudflare Email Routing now has an exact, active `sudoku@ankushagrawal.com` rule forwarding to the owner's verified Gmail destination; the catch-all remains disabled. The dashboard rule and routing status were verified after creation on 2026-07-27.

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

- Require verified email, the provider's minimum password policy, generic auth errors, and server-side provider rate limits before opening public signup.
- CAPTCHA and leaked-password screening are escalation controls, not version 1 launch gates. Add them if signup or recovery abuse appears, if baseline provider limits prove insufficient, or when Neon exposes a supported configuration path.
- Use generic auth errors to reduce account enumeration.
- Require HTTPS outside localhost.
- Validate verification and recovery return URLs against an internal allowlist; never accept a user-provided redirect.
- Verify authenticated server requests per request against the current branch's Neon Auth contract. Create request-scoped auth/data clients so no user's session can leak through a warm Vercel function.
- Keep access and refresh tokens in the provider-supported client storage only; never copy them into app state, analytics, logs, URLs controlled by Sudoku Pilot, or exported data.
- Do not call PostHog `identify` with the Neon Auth user ID by default. Account analytics remain anonymous and contain only method, outcome class, sync state, and migration result.
- Log no passwords, tokens, email addresses, puzzle notes, or imported content.
- Keep the OCR feature independent. Signing in does not automatically upload screenshots or grant higher paid-provider quotas.
- Add retention rules for deleted accounts and operational backups to the Privacy Policy.
- Provide data export and account deletion from the first public release, not as follow-up work.

Before launch, update all current copy that says Sudoku Pilot has no accounts or server-side sync. The replacement must make the distinction explicit: accounts remain optional; guest data remains local; signed-in data is stored for sync and personalization.

### Live acceptance record — 2026-07-26

Passed against the dedicated Neon branch:

- verification and password-recovery messages delivered through Resend;
- email/password signup, OTP confirmation, sign-in, session restoration, password update, and sign-out;
- Google OAuth has no configured provider and Neon's unused Organizations plugin is disabled;
- hosted rate limiting returned `429` after repeated invalid-password attempts;
- two-user RLS negatives for select, insert, update, and delete across `account_state`, `played_puzzles`, and `technique_progress_by_device`;
- Neon Data API Advisors reported no security or performance issues;
- first-sign-in consent, initial merge, two-browser session/sync, active-puzzle conflict choice, export, offline dirty state, reconnect retry, and session refresh behavior;
- no-repeat and sync requests completed without the auth-callback resync loop found during acceptance.

Failed or blocked:

- dependency acceptance: the current beta Neon SDK has no patched release for the Better Auth email-OTP advisory;

### Operational follow-up — 2026-07-27

- Created Neon branch `preview-login-pr-34` and confirmed branch-specific Auth and Data API endpoints.
- Applied both account migrations and refreshed the Data API schema cache on main and Preview.
- Added a project-scoped Neon API key only to Vercel's Production and `codex/login-feature-spec` Preview server environments.
- Bound Production deletion configuration to Neon main and the PR Preview configuration to `preview-login-pr-34`.
- Kept both public feature flags off.
- Created and verified the active Cloudflare reply route from `sudoku@ankushagrawal.com` to the owner's Gmail destination.
- Verified deployed deletion on PR #34 commit `1373101` and deployment `dpl_8LthYJtvWzsiBVdRyx9LgapXRRuJ`: authenticated deletion returned `200`, the Auth session became invalid, no Sudoku-owned rows remained, an unauthenticated request returned `401`, and a cross-origin request returned `403`.

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
- Configure exact production/local URLs, email/password, production email delivery, baseline rate limiting, Data API, RLS, and preview-branch integration.
- Prove real signup, email confirmation, sign-in, session restoration, token refresh, password recovery, sign-out, deletion, and Data API ownership in a non-production branch.
- Prove a Vercel preview receives its matching branch-specific Auth and Data API URLs without trusting arbitrary preview origins.
- Stop if vanilla-JavaScript session handling, callback, email delivery, Free-plan limits, SDK stability, JWT, RLS, or deletion behavior differs from this contract. Reconsider Supabase only through a new explicit decision.

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

- [x] Email/password create, confirm, sign in, restore, reset, and sign out work with generic failure copy.
- [x] Password managers, keyboard navigation, focus trapping, error announcements, and a 320 px viewport work.

### Migration and sync

- [x] First sign-in asks before uploading existing browser data and states what is excluded.
- [x] Repeating migration is idempotent.
- [x] Played-ID union prevents a device-A puzzle from being selected on device B after sync.
- [x] Active-puzzle conflicts never silently overwrite meaningful progress.
- [x] Preferences, current progress, completion totals, and technique counters survive a two-device round trip.
- [x] Offline writes retry without duplicating counts.
- [ ] Catalog exhaustion is explicit and does not silently reset history.

### Security and privacy

- [x] A user cannot read, write, or delete another user's rows in local SQL tests or live negative tests.
- [x] No database URL, email-provider secret, or privileged credential is present in browser assets, source maps, logs, or `VITE_` variables.
- [x] Verification and recovery redirects are allowlisted, and the CSP permits only the exact required Neon Auth and Data API origins.
- [x] Data API Advisors report no unresolved security errors, and two-user negative tests prove every ownership policy.
- [x] Free-plan usage monitoring is active; no billing method, paid plan, or paid overage has been enabled.
- [x] Analytics contain no account identifiers or puzzle content.
- [x] Export and deletion pass for an email/password account.
- [x] Privacy, account-free, About, and offline copy accurately distinguish guest-local from signed-in-cloud behavior.

## Verification plan

- Unit tests for serialization, schema migration, merge rules, revision conflicts, retry classification, and analytics redaction.
- Browser tests with intercepted Neon Auth and Data API endpoints for every auth state and failure mode.
- Branch-isolated Neon SQL/Data API tests with two users proving positive ownership and negative cross-user access for every operation.
- Two-browser end-to-end tests for no-repeat history, current-puzzle conflicts, offline edits, and eventual sync.
- Live non-production tests using real email/password accounts, including recovery, refresh, sign-out, export, and deletion.
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

## Decision log

- **2026-07-25:** Keep accounts optional and preserve guest/offline behavior.
- **2026-07-25:** Treat email as the v1 username; do not add arbitrary handles.
- **2026-07-25:** Initially selected a dedicated Supabase project based on Triptych's exact Vite integration.
- **2026-07-25:** Replaced Supabase with a dedicated Neon project after current Neon Auth review. The deciding factors are the $0 Free plan, existing Neon operations, branchable Auth/data, and lower provider sprawl; the beta vanilla-JavaScript SDK remains a Phase 0 gate.
- **2026-07-25:** Sync no-repeat history and current progress before adding mastery-driven recommendations.
- **2026-07-25:** Require consent, safe migration, export, and deletion in the first public account release.
- **2026-07-26:** Deferred Google and all other social sign-in. Email/password is the complete version 1 authentication scope.
- **2026-07-26:** Accepted `Sudoku Pilot <sudoku@ankushagrawal.com>` as the temporary initial sender. Replyability remains unproven until an inbound alias or mailbox is verified.
- **2026-07-26:** Kept provider rate limiting as the baseline abuse control. CAPTCHA and leaked-password screening become escalation controls rather than launch gates.
- **2026-07-26:** Verified the provider rate limiter, two-user RLS negatives, Data API Advisors, email/password recovery, two-browser sync/conflicts, offline retry, export, and session refresh live.
- **2026-07-26:** Removed the shared Google provider and disabled Neon's unused Organizations plugin so the hosted Auth surface matches the email/password-only scope.
- **2026-07-26:** Kept the launch flag off because hosted Auth user deletion returns `404` and the pinned beta SDK resolves an affected Better Auth version. PR #34 must not merge until both are resolved and final deployment acceptance passes.
- **2026-07-27:** Replaced the unsupported hosted `/delete-user` call with an authenticated server-only deletion endpoint backed by Neon's branch Auth User API and a project-scoped key.
- **2026-07-27:** Isolated PR #34 on `preview-login-pr-34`, retained main for Production, and kept both flags off while the SDK advisory remains.
- **2026-07-27:** Added and verified an exact Cloudflare reply route for the temporary `sudoku@ankushagrawal.com` sender.
- **2026-07-27:** Accepted the Better Auth email-OTP advisory as a tracked launch risk rather than a public-launch blocker.
- **2026-07-27:** Rotated the Sudoku Resend credential to a sending-only key restricted to `ankushagrawal.com` and installed it on Neon's main and Preview branches.
- **2026-07-27:** Passed deployed email/password deletion acceptance on the isolated Preview branch. Approved merging the disabled implementation while keeping both flags off because the pinned Neon SDK still resolves the affected Better Auth version.
- **2026-07-27:** Enabled optional accounts in Production after one disposable account passed verification email delivery, sign-in, sync, export, returning login, authenticated deletion, and post-deletion login rejection. The test user was removed.
