begin;

create table if not exists public.account_state (
  user_id text primary key default auth.user_id(),
  schema_version integer not null check (schema_version between 1 and 2),
  revision bigint not null default 0 check (revision >= 0),
  active_puzzle jsonb,
  active_puzzle_updated_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  legacy_completed_count integer not null default 0 check (legacy_completed_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.played_puzzles (
  user_id text not null default auth.user_id(),
  canonical_id text not null check (length(canonical_id) between 1 and 160),
  first_played_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, canonical_id)
);

create table if not exists public.technique_progress_by_device (
  user_id text not null default auth.user_id(),
  device_id uuid not null,
  technique_id text not null check (length(technique_id) between 1 and 120),
  opportunities integer not null default 0 check (opportunities >= 0),
  independent_successes integer not null default 0 check (independent_successes >= 0),
  assisted_successes integer not null default 0 check (assisted_successes >= 0),
  hint_reveals integer not null default 0 check (hint_reveals >= 0),
  hint_applies integer not null default 0 check (hint_applies >= 0),
  practice_completions integer not null default 0 check (practice_completions >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, technique_id)
);

alter table public.account_state enable row level security;
alter table public.played_puzzles enable row level security;
alter table public.technique_progress_by_device enable row level security;

revoke all on public.account_state from public, anonymous;
revoke all on public.played_puzzles from public, anonymous;
revoke all on public.technique_progress_by_device from public, anonymous;

grant select, insert, update, delete on public.account_state to authenticated;
grant select, insert, update, delete on public.played_puzzles to authenticated;
grant select, insert, update, delete on public.technique_progress_by_device to authenticated;

drop policy if exists account_state_owner_select on public.account_state;
drop policy if exists account_state_owner_insert on public.account_state;
drop policy if exists account_state_owner_update on public.account_state;
drop policy if exists account_state_owner_delete on public.account_state;
create policy account_state_owner_select on public.account_state for select to authenticated
  using ((select auth.user_id()) = user_id);
create policy account_state_owner_insert on public.account_state for insert to authenticated
  with check ((select auth.user_id()) = user_id);
create policy account_state_owner_update on public.account_state for update to authenticated
  using ((select auth.user_id()) = user_id)
  with check ((select auth.user_id()) = user_id);
create policy account_state_owner_delete on public.account_state for delete to authenticated
  using ((select auth.user_id()) = user_id);

drop policy if exists played_puzzles_owner_select on public.played_puzzles;
drop policy if exists played_puzzles_owner_insert on public.played_puzzles;
drop policy if exists played_puzzles_owner_update on public.played_puzzles;
drop policy if exists played_puzzles_owner_delete on public.played_puzzles;
create policy played_puzzles_owner_select on public.played_puzzles for select to authenticated
  using ((select auth.user_id()) = user_id);
create policy played_puzzles_owner_insert on public.played_puzzles for insert to authenticated
  with check ((select auth.user_id()) = user_id);
create policy played_puzzles_owner_update on public.played_puzzles for update to authenticated
  using ((select auth.user_id()) = user_id)
  with check ((select auth.user_id()) = user_id);
create policy played_puzzles_owner_delete on public.played_puzzles for delete to authenticated
  using ((select auth.user_id()) = user_id);

drop policy if exists technique_progress_owner_select on public.technique_progress_by_device;
drop policy if exists technique_progress_owner_insert on public.technique_progress_by_device;
drop policy if exists technique_progress_owner_update on public.technique_progress_by_device;
drop policy if exists technique_progress_owner_delete on public.technique_progress_by_device;
create policy technique_progress_owner_select on public.technique_progress_by_device for select to authenticated
  using ((select auth.user_id()) = user_id);
create policy technique_progress_owner_insert on public.technique_progress_by_device for insert to authenticated
  with check ((select auth.user_id()) = user_id);
create policy technique_progress_owner_update on public.technique_progress_by_device for update to authenticated
  using ((select auth.user_id()) = user_id)
  with check ((select auth.user_id()) = user_id);
create policy technique_progress_owner_delete on public.technique_progress_by_device for delete to authenticated
  using ((select auth.user_id()) = user_id);

commit;
