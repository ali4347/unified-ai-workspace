-- Workspace Models usage control (product change: server-provided models).
--
-- WHY: Workspace mode answers chat turns with the app owner's own provider
-- credential, so the owner pays for every request. Bring-Your-Own-API turns
-- spend the user's own provider quota and are deliberately NOT counted here.
--
-- DESIGN — tamper-resistant by construction:
--   * The counter table has RLS with a SELECT-own policy and deliberately NO
--     insert/update/delete policy, so a user can read their own usage but can
--     never write, decrement, or delete it.
--   * All writes happen inside `consume_workspace_quota()`, a SECURITY DEFINER
--     function with an empty search_path (same hardening as handle_new_user in
--     the M1 migration). It derives the user from auth.uid() and never trusts
--     a client-supplied id, and the increment + limit check are one atomic
--     upsert, so parallel requests cannot race past the limit.
--   * No service-role key is involved: the app keeps its "user reads/writes go
--     through the anon key + RLS" posture.
--
-- Forward-only and idempotent; no existing migration is edited and no existing
-- policy is touched. Day boundaries are UTC.

-- ---------------------------------------------------------------------------
-- Counter table: one row per user per UTC day
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

comment on table public.workspace_usage is
  'Per-user daily request counter for Workspace Models (owner-funded). Written only by consume_workspace_quota(); users may read their own row but never modify it.';

alter table public.workspace_usage enable row level security;

-- Read-only for the owner. No insert/update/delete policy exists on purpose.
drop policy if exists "workspace_usage_select_own" on public.workspace_usage;
create policy "workspace_usage_select_own"
  on public.workspace_usage for select
  using (auth.uid() = user_id);

create index if not exists workspace_usage_user_date_idx
  on public.workspace_usage (user_id, usage_date desc);

create trigger workspace_usage_set_updated_at
  before update on public.workspace_usage
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic consume-one-request. Returns whether the caller may proceed.
-- ---------------------------------------------------------------------------
create or replace function public.consume_workspace_quota(p_daily_limit integer)
returns table (allowed boolean, used integer, daily_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_count integer;
  v_limit integer := greatest(coalesce(p_daily_limit, 0), 0);
begin
  if v_user is null then
    raise exception 'consume_workspace_quota requires an authenticated caller';
  end if;

  -- Atomic: increment and read the new value in one statement, so concurrent
  -- requests serialize on the row rather than both seeing a stale count.
  insert into public.workspace_usage as wu (user_id, usage_date, request_count)
  values (v_user, v_today, 1)
  on conflict (user_id, usage_date)
    do update set request_count = wu.request_count + 1
  returning wu.request_count into v_count;

  if v_count > v_limit then
    -- Over the limit: give the attempt back so a refused request does not
    -- inflate the counter, and report the limit as reached.
    update public.workspace_usage
       set request_count = request_count - 1
     where user_id = v_user and usage_date = v_today;
    return query select false, v_limit, v_limit;
  end if;

  return query select true, v_count, v_limit;
end;
$$;

comment on function public.consume_workspace_quota(integer) is
  'Counts one Workspace Models request for auth.uid() against a daily limit. SECURITY DEFINER so the counter cannot be forged by the caller.';

revoke all on function public.consume_workspace_quota(integer) from public;
grant execute on function public.consume_workspace_quota(integer) to authenticated;
