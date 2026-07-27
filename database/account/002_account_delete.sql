begin;

create or replace function public.account_current_user_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.user_id()
$$;

revoke all on function public.account_current_user_id() from public, anonymous;
grant execute on function public.account_current_user_id() to authenticated;

commit;
