-- ===========================================================================
-- Database RLS verification suite (SQL impersonation)
-- PRD §32 (RLS), §55 / §59 ("unauthorized cross-user access tests fail").
-- See supabase/tests/README.md for how to run this.
--
-- STORAGE IS OUT OF SCOPE FOR SQL — READ-ONLY HERE. Supabase protects storage
-- tables from direct DML ("Direct deletion from storage tables is not allowed.
-- Use the Storage API instead."): Storage metadata and the physical object
-- store must stay synchronized, so SQL writes to storage.objects are both
-- forbidden and unrepresentative of real client behaviour. This suite only
-- verifies (read-only) that the attachments ownership POLICIES exist as
-- migrated (§13); the behavioral authorization matrix runs through the real
-- Storage API with real user JWTs in supabase/tests/storage_rls_check.ts.
-- ===========================================================================
--
-- SAFETY MODEL
--
--   * The whole suite runs inside ONE transaction that always ends in ROLLBACK.
--     No fixture row or policy change survives it. storage.objects is never
--     written (see above) — the only storage access is a catalog read.
--   * It NEVER inserts into auth.users. Every user-owned table has
--     `user_id uuid references auth.users(id)`, so synthetic uuids would fail the
--     foreign key, and hand-writing GoTrue-managed rows is unsafe on hosted
--     Supabase (its column set changes between releases). Instead the suite
--     BORROWS the two oldest existing auth.users as identities A and B and
--     impersonates them the same way PostgREST does: by setting
--     `request.jwt.claims` and `SET LOCAL ROLE authenticated`, which is what
--     `auth.uid()` reads. Policies never join to auth.users, so this is a
--     faithful simulation. It requires >= 2 existing users and fails loudly
--     otherwise (see README → "Test identities").
--   * Fixture rows all share the uuid prefix 'de77de77-...', and every mutated
--     value is a deterministic literal, so the companion script
--     rls_cleanup_check.sql can prove none of them survived the rollback.
--   * This script depends on NOTHING after its ROLLBACK. It creates no temp
--     table and no scratch table: the hosted SQL Editor gives no guarantee
--     that session-local state survives a transaction boundary, so cleanup
--     verification is a separate, self-contained, read-only query.
--
-- A GREEN RUN MEANS: every assertion below passed. The suite ends by returning
-- ONE VISIBLE RESULT ROW:
--
--     status              | assertions_passed | assertions_expected
--     RLS_CHECKS_PASSED   | 110               | 110
--
-- Confirm the run from that row, NOT from RAISE NOTICE output — the hosted
-- Supabase SQL Editor surfaces SELECT result sets but does not reliably display
-- notices. assertions_passed is read from the live `test.checks` counter and a
-- guard raises if it is anything other than 110, so the row cannot lie. If the
-- run ends any other way, treat it as a failure and do NOT weaken any policy to
-- make it pass.
--
-- INTENDED-BEHAVIOUR NOTES (PRD-driven asymmetries — tested as designed, not
-- forced into a uniform matrix):
--   * public.profiles         has NO delete policy → nobody may delete a profile,
--                             not even their own. Profiles die with the auth user
--                             via ON DELETE CASCADE.
--   * public.attachments      has NO update policy → attachments are immutable;
--                             replace by delete + insert.
--   * public.provider_events  has NO update policy → the event log is append-only.
--   * public.providers/models are reference data: readable by any authenticated
--                             user, writable only by migrations / service role.
--
-- RESOLVED FINDINGS (2026-08-27):
--   * provider_sessions: connected_account_id/device_id chains unenforced.
--     Fixed by 20260825180000; §11 asserts both chains, INSERT and UPDATE.
--   * messages: conversation chain enforced on INSERT but not UPDATE.
--     Fixed by 20260825190000; §7 asserts the UPDATE chain.
--   * messages.account_id, conversations.project_id,
--     conversations.active_account_id, attachments.message_id: parent
--     ownership unverified (NULL always allowed; attachments additionally
--     require the referenced message to live in the SAME conversation).
--     Fixed by 20260825200000; §6b, §7 and §8 assert every chain with
--     positive controls (own reference and NULL both succeed) so a deny-all
--     policy cannot go green.
--   * provider_events: account_id/conversation_id unverified on INSERT (rows
--     are immutable, so INSERT is the only writable path). Fixed by
--     20260825210000; §11b asserts both chains plus the previously-missing
--     provider_events isolation matrix.
--   With this, EVERY mutable FK from a user-owned row into a user-owned
--   parent is chained — the family is closed (audit in README → Findings).
-- ===========================================================================




-- ===========================================================================
-- PART 1 — the suite (transactional, always rolled back)
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- §0  Identities + assertion helper
-- ---------------------------------------------------------------------------

do $$
declare
  ids uuid[];
begin
  select array_agg(id order by created_at)
    into ids
    from (select id, created_at from auth.users order by created_at limit 2) t;

  if ids is null or array_length(ids, 1) < 2 then
    raise exception
      'SETUP: this suite needs >= 2 existing auth.users to borrow as identities A and B; found %. Create a second user through Supabase Auth (dashboard or signup) and re-run. Never hand-insert into auth.users.',
      coalesce(array_length(ids, 1), 0);
  end if;

  perform set_config('test.uid_a', ids[1]::text, true);
  perform set_config('test.uid_b', ids[2]::text, true);
  perform set_config('test.checks', '0', true);

  -- Captured here, as owner, because the `authenticated` role cannot read
  -- auth.users. Transaction-local GUC — no temp table, nothing to survive the
  -- rollback (the hosted SQL Editor does not guarantee that it would).
  perform set_config(
    'test.auth_users',
    (select count(*) from auth.users)::text,
    true
  );
end $$;

-- Pre-test counts, for the operator's optional manual comparison against the
-- same query after the run (see README → "Optional: manual count comparison").
-- The primary production-untouched guarantee does NOT depend on these: it is
-- proved by rls_cleanup_check.sql through the absence of every deterministic
-- fixture identifier, plus the fact that this suite never writes auth.users
-- and never writes the providers/models reference tables.
do $$
begin
  raise notice 'Pre-test counts — auth.users=%, profiles=%, connected_accounts=%, projects=%, conversations=%, messages=%, attachments=%, provider_sessions=%, extension_devices=%, provider_events=%',
    (select count(*) from auth.users),
    (select count(*) from public.profiles),
    (select count(*) from public.connected_accounts),
    (select count(*) from public.projects),
    (select count(*) from public.conversations),
    (select count(*) from public.messages),
    (select count(*) from public.attachments),
    (select count(*) from public.provider_sessions),
    (select count(*) from public.extension_devices),
    (select count(*) from public.provider_events);
end $$;

-- Assertion helper: counts every check so the suite can report N/N, and raises
-- with a precise table/action label on failure.
create or replace function pg_temp.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  perform set_config(
    'test.checks',
    (coalesce(current_setting('test.checks', true), '0')::int + 1)::text,
    true
  );
  if not cond then
    raise exception 'FAIL %', msg;
  end if;
end $$;

-- Impersonate a user the way PostgREST does.
create or replace function pg_temp.become(uid text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

-- ---------------------------------------------------------------------------
-- §1  Fixtures — created as the owner role (bypasses RLS on purpose) so that
--     the authenticated-role phase starts from a known two-user state.
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  b uuid := current_setting('test.uid_b')::uuid;
  claude_provider uuid;
  claude_model uuid;
begin
  select id into claude_provider from public.providers where slug = 'claude';
  select id into claude_model from public.models
    where provider_id = claude_provider and external_id = 'claude-sonnet';

  -- profiles: guarantee both identities have one (production rows are reused
  -- when present; the insert is a no-op then).
  insert into public.profiles (id, email)
  values (a, 'rls-check-a@example.invalid'), (b, 'rls-check-b@example.invalid')
  on conflict (id) do nothing;

  -- connected_accounts
  insert into public.connected_accounts (id, user_id, provider_id, email, status, metadata)
  values
    ('de77de77-0000-4000-8000-000000000a05', a, claude_provider, 'a@example.invalid', 'connected', '{"mode":"manual"}'),
    ('de77de77-0000-4000-8000-000000000b05', b, claude_provider, 'b@example.invalid', 'connected', '{"mode":"manual"}');

  -- projects (…a01 read fixture, …a21 delete target)
  insert into public.projects (id, user_id, name)
  values
    ('de77de77-0000-4000-8000-000000000a01', a, 'A project'),
    ('de77de77-0000-4000-8000-000000000a21', a, 'A project (delete target)'),
    ('de77de77-0000-4000-8000-000000000b01', b, 'B project');

  -- conversations (…a29 is the move target for the messages update-chain checks)
  insert into public.conversations (id, user_id, title, project_id)
  values
    ('de77de77-0000-4000-8000-000000000a02', a, 'A conversation', 'de77de77-0000-4000-8000-000000000a01'),
    ('de77de77-0000-4000-8000-000000000a22', a, 'A conversation (delete target)', null),
    ('de77de77-0000-4000-8000-000000000a29', a, 'A second conversation', null),
    ('de77de77-0000-4000-8000-000000000b02', b, 'B conversation', null);

  -- messages
  insert into public.messages (id, conversation_id, user_id, role, content, provider_id, model_id)
  values
    ('de77de77-0000-4000-8000-000000000a03', 'de77de77-0000-4000-8000-000000000a02', a, 'user', 'A secret message', claude_provider, claude_model),
    ('de77de77-0000-4000-8000-000000000a23', 'de77de77-0000-4000-8000-000000000a02', a, 'user', 'A delete target', null, null),
    ('de77de77-0000-4000-8000-000000000b03', 'de77de77-0000-4000-8000-000000000b02', b, 'user', 'B secret message', null, null);

  -- attachments
  insert into public.attachments (id, user_id, conversation_id, file_name, storage_path)
  values
    ('de77de77-0000-4000-8000-000000000a04', a, 'de77de77-0000-4000-8000-000000000a02', 'a.txt', a::text || '/rls-check/a.txt'),
    ('de77de77-0000-4000-8000-000000000a24', a, 'de77de77-0000-4000-8000-000000000a02', 'a-del.txt', a::text || '/rls-check/a-del.txt'),
    ('de77de77-0000-4000-8000-000000000b04', b, 'de77de77-0000-4000-8000-000000000b02', 'b.txt', b::text || '/rls-check/b.txt');

  -- extension_devices
  insert into public.extension_devices (id, user_id, device_name)
  values
    ('de77de77-0000-4000-8000-000000000a07', a, 'A laptop'),
    ('de77de77-0000-4000-8000-000000000a27', a, 'A laptop (delete target)'),
    ('de77de77-0000-4000-8000-000000000b07', b, 'B laptop');

  -- provider_sessions
  insert into public.provider_sessions (id, user_id, connected_account_id, device_id, status)
  values
    ('de77de77-0000-4000-8000-000000000a06', a, 'de77de77-0000-4000-8000-000000000a05', 'de77de77-0000-4000-8000-000000000a07', 'active'),
    ('de77de77-0000-4000-8000-000000000a26', a, 'de77de77-0000-4000-8000-000000000a05', null, 'inactive'),
    ('de77de77-0000-4000-8000-000000000b06', b, 'de77de77-0000-4000-8000-000000000b05', null, 'active');

  -- provider_events
  insert into public.provider_events (id, user_id, provider_id, conversation_id, event_type)
  values
    ('de77de77-0000-4000-8000-000000000a08', a, claude_provider, 'de77de77-0000-4000-8000-000000000a02', 'connected'),
    ('de77de77-0000-4000-8000-000000000a28', a, claude_provider, null, 'model_changed'),
    ('de77de77-0000-4000-8000-000000000b08', b, claude_provider, null, 'connected');

  -- NO storage.objects fixtures: Supabase forbids direct DML on storage
  -- tables (metadata ↔ object-store sync). Storage authorization is tested
  -- through the Storage API in supabase/tests/storage_rls_check.ts.
exception
  when others then
    raise exception
      'SETUP: could not create fixtures (%). The suite cannot verify isolation without them — do not treat this as a pass. SQLSTATE=%',
      sqlerrm, sqlstate;
end $$;

-- ---------------------------------------------------------------------------
-- §2  Switch to the authenticated role AS USER A.
--     Everything below is evaluated under RLS.
-- ---------------------------------------------------------------------------

set local role authenticated;
do $$ begin perform pg_temp.become(current_setting('test.uid_a')); end $$;

-- Harness canary: if RLS were bypassed (e.g. still running as owner, or FORCE
-- RLS missing), user A would see BOTH profiles and every check below would be a
-- false green. Assert the boundary is real before testing anything else.
do $$
declare
  visible integer;
  total   integer;
begin
  select count(*) into visible from public.profiles;
  total := current_setting('test.auth_users')::int;
  perform pg_temp.ok(
    visible = 1,
    'harness/canary: user A should see exactly 1 profile under RLS but saw ' || visible ||
    ' — RLS is NOT being enforced for this session, so no result below is trustworthy'
  );
  perform pg_temp.ok(
    total >= 2,
    'harness/canary: expected >= 2 auth users to borrow, found ' || total
  );
end $$;

-- ---------------------------------------------------------------------------
-- §3  profiles  (select/insert/update own; NO delete policy by design)
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.profiles where id = a;
  perform pg_temp.ok(n = 1, 'profiles/select-own: A cannot read their own profile');

  select count(*) into n from public.profiles where id = b;
  perform pg_temp.ok(n = 0, 'profiles/select-other: A can READ B''s profile');

  update public.profiles set display_name = 'A renamed' where id = a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'profiles/update-own: A cannot update their own profile');

  update public.profiles set display_name = 'hijacked' where id = b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'profiles/update-other: A can UPDATE B''s profile');

  -- Intended behaviour: no delete policy exists, so even own-delete is denied.
  delete from public.profiles where id = a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'profiles/delete-own: profiles must not be deletable (no delete policy by design)');

  delete from public.profiles where id = b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'profiles/delete-other: A can DELETE B''s profile');

  begin
    insert into public.profiles (id, email) values (b, 'spoof@example.invalid');
  exception when insufficient_privilege or unique_violation then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'profiles/insert-as-other: A can INSERT a profile owned by B');
end $$;

-- ---------------------------------------------------------------------------
-- §4  connected_accounts  (full own CRUD)
-- ---------------------------------------------------------------------------

do $$
declare
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.connected_accounts where id = 'de77de77-0000-4000-8000-000000000a05';
  perform pg_temp.ok(n = 1, 'connected_accounts/select-own: A cannot read their own account');

  select count(*) into n from public.connected_accounts where id = 'de77de77-0000-4000-8000-000000000b05';
  perform pg_temp.ok(n = 0, 'connected_accounts/select-other: A can READ B''s connected account');

  update public.connected_accounts set display_name = 'A renamed' where id = 'de77de77-0000-4000-8000-000000000a05';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'connected_accounts/update-own: A cannot update their own account');

  update public.connected_accounts set email = 'hijacked@example.invalid' where id = 'de77de77-0000-4000-8000-000000000b05';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'connected_accounts/update-other: A can UPDATE B''s connected account');

  delete from public.connected_accounts where id = 'de77de77-0000-4000-8000-000000000b05';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'connected_accounts/delete-other: A can DELETE B''s connected account');

  begin
    insert into public.connected_accounts (user_id, provider_id, email, status)
    select b, id, 'spoof@example.invalid', 'connected' from public.providers where slug = 'claude';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'connected_accounts/insert-as-other: A can INSERT an account owned by B');
end $$;

-- ---------------------------------------------------------------------------
-- §5  projects  (full own CRUD)
-- ---------------------------------------------------------------------------

do $$
declare
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.projects where id = 'de77de77-0000-4000-8000-000000000a01';
  perform pg_temp.ok(n = 1, 'projects/select-own: A cannot read their own project');

  select count(*) into n from public.projects where id = 'de77de77-0000-4000-8000-000000000b01';
  perform pg_temp.ok(n = 0, 'projects/select-other: A can READ B''s project');

  update public.projects set name = 'A renamed' where id = 'de77de77-0000-4000-8000-000000000a01';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'projects/update-own: A cannot update their own project');

  update public.projects set name = 'hijacked' where id = 'de77de77-0000-4000-8000-000000000b01';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'projects/update-other: A can UPDATE B''s project');

  delete from public.projects where id = 'de77de77-0000-4000-8000-000000000a21';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'projects/delete-own: A cannot delete their own project');

  delete from public.projects where id = 'de77de77-0000-4000-8000-000000000b01';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'projects/delete-other: A can DELETE B''s project');

  begin
    insert into public.projects (user_id, name) values (b, 'spoofed project');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'projects/insert-as-other: A can INSERT a project owned by B');
end $$;

-- ---------------------------------------------------------------------------
-- §6  conversations  (full own CRUD)
-- ---------------------------------------------------------------------------

do $$
declare
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.conversations where id = 'de77de77-0000-4000-8000-000000000a02';
  perform pg_temp.ok(n = 1, 'conversations/select-own: A cannot read their own conversation');

  select count(*) into n from public.conversations where id = 'de77de77-0000-4000-8000-000000000b02';
  perform pg_temp.ok(n = 0, 'conversations/select-other: A can READ B''s conversation');

  update public.conversations set title = 'A renamed' where id = 'de77de77-0000-4000-8000-000000000a02';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'conversations/update-own: A cannot update their own conversation');

  update public.conversations set title = 'hijacked' where id = 'de77de77-0000-4000-8000-000000000b02';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'conversations/update-other: A can UPDATE B''s conversation');

  delete from public.conversations where id = 'de77de77-0000-4000-8000-000000000a22';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'conversations/delete-own: A cannot delete their own conversation');

  delete from public.conversations where id = 'de77de77-0000-4000-8000-000000000b02';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'conversations/delete-other: A can DELETE B''s conversation');

  begin
    insert into public.conversations (user_id, title) values (b, 'spoofed conversation');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'conversations/insert-as-other: A can INSERT a conversation owned by B');
end $$;

-- ---------------------------------------------------------------------------
-- §6b conversations ownership chains (20260825200000): project_id and
--     active_account_id must be NULL or belong to the caller, on INSERT and
--     UPDATE. Positive controls first so a deny-all policy cannot go green.
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  n integer;
  blocked boolean;
begin
  -- Positive: own project + own active account.
  insert into public.conversations (id, user_id, title, project_id, active_account_id)
  values ('de77de77-0000-4000-8000-0000000000d1', a, 'A chained conversation',
          'de77de77-0000-4000-8000-000000000a01', 'de77de77-0000-4000-8000-000000000a05');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'conversations/insert-own-chain: A cannot create a conversation in their OWN project with their OWN account — the policy is too strict');

  -- Positive: both references null.
  insert into public.conversations (id, user_id, title, project_id, active_account_id)
  values ('de77de77-0000-4000-8000-0000000000d2', a, 'A null-chain conversation', null, null);
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'conversations/insert-null-chain: A cannot create a conversation with NULL project/account — the policy is too strict');

  -- Negative: B's project on INSERT.
  blocked := false;
  begin
    insert into public.conversations (user_id, title, project_id)
    values (a, 'filed under B', 'de77de77-0000-4000-8000-000000000b01');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'conversations/insert-project-chain: A can CREATE a conversation inside B''s project');

  -- Negative: B's connected account on INSERT.
  blocked := false;
  begin
    insert into public.conversations (user_id, title, active_account_id)
    values (a, 'pointing at B account', 'de77de77-0000-4000-8000-000000000b05');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'conversations/insert-account-chain: A can CREATE a conversation referencing B''s connected account');

  -- Negative: repoint an own conversation at B's project on UPDATE.
  blocked := false;
  begin
    update public.conversations
       set project_id = 'de77de77-0000-4000-8000-000000000b01'
     where id = 'de77de77-0000-4000-8000-0000000000d2';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'conversations/update-project-chain: A can MOVE their own conversation into B''s project');

  -- Positive: repoint at an OWN project on UPDATE.
  update public.conversations
     set project_id = 'de77de77-0000-4000-8000-000000000a01'
   where id = 'de77de77-0000-4000-8000-0000000000d2';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'conversations/update-project-own: A cannot move their own conversation into their OWN project — the policy is too strict');

  -- Negative: repoint active_account_id at B's account on UPDATE.
  blocked := false;
  begin
    update public.conversations
       set active_account_id = 'de77de77-0000-4000-8000-000000000b05'
     where id = 'de77de77-0000-4000-8000-0000000000d2';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'conversations/update-account-chain: A can REPOINT their own conversation at B''s connected account');

  -- Positive: repoint at an OWN account on UPDATE.
  update public.conversations
     set active_account_id = 'de77de77-0000-4000-8000-000000000a05'
   where id = 'de77de77-0000-4000-8000-0000000000d2';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'conversations/update-account-own: A cannot point their own conversation at their OWN account — the policy is too strict');
end $$;

-- ---------------------------------------------------------------------------
-- §7  messages  (own CRUD + conversation-ownership chain on insert)
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.messages where id = 'de77de77-0000-4000-8000-000000000a03';
  perform pg_temp.ok(n = 1, 'messages/select-own: A cannot read their own message');

  select count(*) into n from public.messages where id = 'de77de77-0000-4000-8000-000000000b03';
  perform pg_temp.ok(n = 0, 'messages/select-other: A can READ B''s message');

  update public.messages set content = 'A edited' where id = 'de77de77-0000-4000-8000-000000000a03';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'messages/update-own: A cannot update their own message');

  update public.messages set content = 'hijacked' where id = 'de77de77-0000-4000-8000-000000000b03';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'messages/update-other: A can UPDATE B''s message');

  delete from public.messages where id = 'de77de77-0000-4000-8000-000000000a23';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'messages/delete-own: A cannot delete their own message');

  delete from public.messages where id = 'de77de77-0000-4000-8000-000000000b03';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'messages/delete-other: A can DELETE B''s message');

  -- own conversation, own user_id → allowed
  insert into public.messages (conversation_id, user_id, role, content)
  values ('de77de77-0000-4000-8000-000000000a02', a, 'user', 'A new message');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'messages/insert-own: A cannot insert into their own conversation');

  -- FK OWNERSHIP CHAIN: A claims their own user_id but targets B's conversation.
  blocked := false;
  begin
    insert into public.messages (conversation_id, user_id, role, content)
    values ('de77de77-0000-4000-8000-000000000b02', a, 'user', 'injected into B''s thread');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'messages/insert-chain: A can INJECT a message into B''s conversation — the conversation-ownership chain is not enforced');

  -- spoofing user_id outright
  blocked := false;
  begin
    insert into public.messages (conversation_id, user_id, role, content)
    values ('de77de77-0000-4000-8000-000000000a02', b, 'user', 'spoofed owner');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'messages/insert-as-other: A can INSERT a message owned by B');

  -- UPDATE OWNERSHIP CHAIN (20260825190000): conversation_id is mutable, so
  -- the chain must hold on UPDATE too, not just INSERT.

  -- Positive control first: moving an own message between two OWN
  -- conversations must work, so a deny-all policy cannot produce a green run.
  update public.messages
     set conversation_id = 'de77de77-0000-4000-8000-000000000a29'
   where id = 'de77de77-0000-4000-8000-000000000a03';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'messages/update-move-own: A cannot move their own message between their OWN conversations — the policy is too strict');

  -- A may not move their own message into B's conversation.
  blocked := false;
  begin
    update public.messages
       set conversation_id = 'de77de77-0000-4000-8000-000000000b02'
     where id = 'de77de77-0000-4000-8000-000000000a03';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'messages/update-move-chain: A can MOVE their own message into B''s conversation — the UPDATE ownership chain is not enforced');

  -- A may not hand their own message to B by rewriting user_id.
  blocked := false;
  begin
    update public.messages
       set user_id = b
     where id = 'de77de77-0000-4000-8000-000000000a03';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'messages/update-reassign-owner: A can CHANGE their own message''s user_id to B');

  -- ACCOUNT OWNERSHIP CHAIN (20260825200000): account_id must be NULL or an
  -- own connected account, on INSERT and UPDATE.

  -- Positive: own account on INSERT.
  insert into public.messages (conversation_id, user_id, role, content, account_id)
  values ('de77de77-0000-4000-8000-000000000a02', a, 'assistant', 'reply via A account',
          'de77de77-0000-4000-8000-000000000a05');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'messages/insert-own-account: A cannot insert a message referencing their OWN account — the policy is too strict');

  -- Positive: NULL account on INSERT.
  insert into public.messages (conversation_id, user_id, role, content, account_id)
  values ('de77de77-0000-4000-8000-000000000a02', a, 'user', 'no account', null);
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'messages/insert-null-account: A cannot insert a message with a NULL account_id — the policy is too strict');

  -- Negative: B's account on INSERT.
  blocked := false;
  begin
    insert into public.messages (conversation_id, user_id, role, content, account_id)
    values ('de77de77-0000-4000-8000-000000000a02', a, 'assistant', 'labeled with B account',
            'de77de77-0000-4000-8000-000000000b05');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'messages/insert-account-chain: A can INSERT a message referencing B''s connected account');

  -- Positive: repoint an own message at an OWN account on UPDATE.
  update public.messages
     set account_id = 'de77de77-0000-4000-8000-000000000a05'
   where id = 'de77de77-0000-4000-8000-000000000a03';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'messages/update-account-own: A cannot point their own message at their OWN account — the policy is too strict');

  -- Negative: repoint at B's account on UPDATE.
  blocked := false;
  begin
    update public.messages
       set account_id = 'de77de77-0000-4000-8000-000000000b05'
     where id = 'de77de77-0000-4000-8000-000000000a03';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'messages/update-account-chain: A can REPOINT their own message at B''s connected account');
end $$;

-- ---------------------------------------------------------------------------
-- §8  attachments  (own select/insert/delete + chain; NO update policy by design)
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.attachments where id = 'de77de77-0000-4000-8000-000000000a04';
  perform pg_temp.ok(n = 1, 'attachments/select-own: A cannot read their own attachment');

  select count(*) into n from public.attachments where id = 'de77de77-0000-4000-8000-000000000b04';
  perform pg_temp.ok(n = 0, 'attachments/select-other: A can READ B''s attachment');

  -- Intended behaviour: attachments are immutable (no update policy).
  update public.attachments set file_name = 'renamed.txt' where id = 'de77de77-0000-4000-8000-000000000a04';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'attachments/update-own: attachments must be immutable (no update policy by design)');

  update public.attachments set file_name = 'hijacked.txt' where id = 'de77de77-0000-4000-8000-000000000b04';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'attachments/update-other: A can UPDATE B''s attachment');

  delete from public.attachments where id = 'de77de77-0000-4000-8000-000000000a24';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'attachments/delete-own: A cannot delete their own attachment');

  delete from public.attachments where id = 'de77de77-0000-4000-8000-000000000b04';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'attachments/delete-other: A can DELETE B''s attachment');

  insert into public.attachments (user_id, conversation_id, file_name, storage_path)
  values (a, 'de77de77-0000-4000-8000-000000000a02', 'new.txt', a::text || '/rls-check/new.txt');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'attachments/insert-own: A cannot attach to their own conversation');

  -- FK OWNERSHIP CHAIN: own user_id, B's conversation.
  blocked := false;
  begin
    insert into public.attachments (user_id, conversation_id, file_name, storage_path)
    values (a, 'de77de77-0000-4000-8000-000000000b02', 'injected.txt', a::text || '/rls-check/injected.txt');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'attachments/insert-chain: A can ATTACH to B''s conversation — the conversation-ownership chain is not enforced');

  blocked := false;
  begin
    insert into public.attachments (user_id, conversation_id, file_name, storage_path)
    values (b, 'de77de77-0000-4000-8000-000000000a02', 'spoof.txt', b::text || '/rls-check/spoof.txt');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'attachments/insert-as-other: A can INSERT an attachment owned by B');

  -- MESSAGE OWNERSHIP CHAIN (20260825200000): message_id must be NULL or an
  -- own message in the SAME conversation as the attachment.
  -- (Message a03 was moved to conversation …a29 by the §7 update-move-own
  -- check, so …a29 is its home conversation from here on.)

  -- Positive: own message, same own conversation.
  insert into public.attachments (user_id, conversation_id, message_id, file_name, storage_path)
  values (a, 'de77de77-0000-4000-8000-000000000a29', 'de77de77-0000-4000-8000-000000000a03',
          'linked.txt', a::text || '/rls-check/linked.txt');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'attachments/insert-own-message: A cannot attach to their OWN message in the same conversation — the policy is too strict');

  -- Positive: NULL message_id.
  insert into public.attachments (user_id, conversation_id, message_id, file_name, storage_path)
  values (a, 'de77de77-0000-4000-8000-000000000a29', null,
          'unlinked.txt', a::text || '/rls-check/unlinked.txt');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'attachments/insert-null-message: A cannot attach with a NULL message_id — the policy is too strict');

  -- Negative: B's message.
  blocked := false;
  begin
    insert into public.attachments (user_id, conversation_id, message_id, file_name, storage_path)
    values (a, 'de77de77-0000-4000-8000-000000000a02', 'de77de77-0000-4000-8000-000000000b03',
            'stolen-link.txt', a::text || '/rls-check/stolen-link.txt');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'attachments/insert-other-message: A can ATTACH to B''s message');

  -- Negative: own message but from a DIFFERENT conversation (a03 lives in
  -- …a29; the attachment claims …a02).
  blocked := false;
  begin
    insert into public.attachments (user_id, conversation_id, message_id, file_name, storage_path)
    values (a, 'de77de77-0000-4000-8000-000000000a02', 'de77de77-0000-4000-8000-000000000a03',
            'cross-link.txt', a::text || '/rls-check/cross-link.txt');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'attachments/insert-cross-conversation: A can attach to an own message from a DIFFERENT conversation than the attachment claims');
end $$;

-- ---------------------------------------------------------------------------
-- §9  extension_devices  (full own CRUD)
-- ---------------------------------------------------------------------------

do $$
declare
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.extension_devices where id = 'de77de77-0000-4000-8000-000000000a07';
  perform pg_temp.ok(n = 1, 'extension_devices/select-own: A cannot read their own device');

  select count(*) into n from public.extension_devices where id = 'de77de77-0000-4000-8000-000000000b07';
  perform pg_temp.ok(n = 0, 'extension_devices/select-other: A can READ B''s device');

  update public.extension_devices set device_name = 'A renamed' where id = 'de77de77-0000-4000-8000-000000000a07';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'extension_devices/update-own: A cannot update their own device');

  update public.extension_devices set status = 'revoked' where id = 'de77de77-0000-4000-8000-000000000b07';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'extension_devices/update-other: A can UPDATE B''s device');

  delete from public.extension_devices where id = 'de77de77-0000-4000-8000-000000000a27';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'extension_devices/delete-own: A cannot delete their own device');

  delete from public.extension_devices where id = 'de77de77-0000-4000-8000-000000000b07';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'extension_devices/delete-other: A can DELETE B''s device');

  begin
    insert into public.extension_devices (user_id, device_name) values (b, 'spoofed device');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'extension_devices/insert-as-other: A can INSERT a device owned by B');
end $$;

-- ---------------------------------------------------------------------------
-- §10 provider_sessions  (full own CRUD)
-- ---------------------------------------------------------------------------

do $$
declare
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from public.provider_sessions where id = 'de77de77-0000-4000-8000-000000000a06';
  perform pg_temp.ok(n = 1, 'provider_sessions/select-own: A cannot read their own session');

  select count(*) into n from public.provider_sessions where id = 'de77de77-0000-4000-8000-000000000b06';
  perform pg_temp.ok(n = 0, 'provider_sessions/select-other: A can READ B''s provider session');

  update public.provider_sessions set status = 'inactive' where id = 'de77de77-0000-4000-8000-000000000a06';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'provider_sessions/update-own: A cannot update their own session');

  update public.provider_sessions set status = 'error' where id = 'de77de77-0000-4000-8000-000000000b06';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'provider_sessions/update-other: A can UPDATE B''s provider session');

  delete from public.provider_sessions where id = 'de77de77-0000-4000-8000-000000000a26';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'provider_sessions/delete-own: A cannot delete their own session');

  delete from public.provider_sessions where id = 'de77de77-0000-4000-8000-000000000b06';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'provider_sessions/delete-other: A can DELETE B''s provider session');

  begin
    insert into public.provider_sessions (user_id, connected_account_id, status)
    values (b, 'de77de77-0000-4000-8000-000000000b05', 'active');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'provider_sessions/insert-as-other: A can INSERT a session owned by B');
end $$;

-- ---------------------------------------------------------------------------
-- §11 provider_sessions ownership chains (hard assertions)
--     Enforced by 20260825180000_provider_sessions_ownership_chain.sql: a
--     session row must reference a connected_account — and a device, when set —
--     that belongs to the caller, not just carry the caller's user_id.
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  n integer;
  blocked boolean;
begin
  -- INSERT pointing at B's connected account while claiming A's user_id.
  blocked := false;
  begin
    insert into public.provider_sessions (id, user_id, connected_account_id, status)
    values ('de77de77-0000-4000-8000-0000000000c1', a, 'de77de77-0000-4000-8000-000000000b05', 'active');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'provider_sessions/insert-account-chain: A can CREATE a session referencing B''s connected_account_id — the connected_accounts ownership chain is not enforced');

  -- UPDATE an existing own session to point at B's connected account.
  blocked := false;
  begin
    update public.provider_sessions
       set connected_account_id = 'de77de77-0000-4000-8000-000000000b05'
     where id = 'de77de77-0000-4000-8000-000000000a06';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'provider_sessions/update-account-chain: A can REPOINT their own session at B''s connected_account_id');

  -- INSERT pointing at B's extension device (the second ownership chain).
  blocked := false;
  begin
    insert into public.provider_sessions (user_id, connected_account_id, device_id, status)
    values (a, 'de77de77-0000-4000-8000-000000000a05', 'de77de77-0000-4000-8000-000000000b07', 'active');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'provider_sessions/insert-device-chain: A can CREATE a session referencing B''s extension device');

  -- Positive control: entirely own chain must still be allowed, so the fix
  -- cannot pass by simply denying everything.
  insert into public.provider_sessions (user_id, connected_account_id, device_id, status)
  values (a, 'de77de77-0000-4000-8000-000000000a05', 'de77de77-0000-4000-8000-000000000a07', 'active');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'provider_sessions/insert-own-chain: A cannot create a session referencing their OWN account and device — the policy is too strict');
end $$;

-- ---------------------------------------------------------------------------
-- §11b provider_events (select/insert/delete own; NO update policy by design —
--      the event log is append-only) + FK ownership chains (20260825210000).
--      This table's matrix was missing from the suite until 2026-08-27; a
--      green run before then said nothing about provider_events.
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean;
begin
  -- Isolation matrix.
  select count(*) into n from public.provider_events where id = 'de77de77-0000-4000-8000-000000000a08';
  perform pg_temp.ok(n = 1, 'provider_events/select-own: A cannot read their own event');

  select count(*) into n from public.provider_events where id = 'de77de77-0000-4000-8000-000000000b08';
  perform pg_temp.ok(n = 0, 'provider_events/select-other: A can READ B''s event');

  -- Intended behaviour: append-only — even own rows must reject UPDATE.
  update public.provider_events set event_type = 'rewritten' where id = 'de77de77-0000-4000-8000-000000000a08';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'provider_events/update-own: the event log must be append-only (no update policy by design)');

  update public.provider_events set event_type = 'hijacked' where id = 'de77de77-0000-4000-8000-000000000b08';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'provider_events/update-other: A can UPDATE B''s event');

  delete from public.provider_events where id = 'de77de77-0000-4000-8000-000000000a28';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'provider_events/delete-own: A cannot delete their own event');

  delete from public.provider_events where id = 'de77de77-0000-4000-8000-000000000b08';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'provider_events/delete-other: A can DELETE B''s event');

  blocked := false;
  begin
    insert into public.provider_events (user_id, event_type) values (b, 'spoofed event');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'provider_events/insert-as-other: A can INSERT an event owned by B');

  -- FK OWNERSHIP CHAINS (20260825210000): account_id and conversation_id must
  -- be NULL or belong to the caller. Positive controls first.

  insert into public.provider_events (user_id, event_type, account_id, conversation_id)
  values (a, 'connected', 'de77de77-0000-4000-8000-000000000a05', 'de77de77-0000-4000-8000-000000000a02');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'provider_events/insert-own-chain: A cannot log an event referencing their OWN account and conversation — the policy is too strict');

  insert into public.provider_events (user_id, event_type, account_id, conversation_id)
  values (a, 'disconnected', null, null);
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1,
    'provider_events/insert-null-chain: A cannot log an event with NULL account/conversation — the policy is too strict');

  blocked := false;
  begin
    insert into public.provider_events (user_id, event_type, account_id)
    values (a, 'connected', 'de77de77-0000-4000-8000-000000000b05');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'provider_events/insert-account-chain: A can LOG an event referencing B''s connected account');

  blocked := false;
  begin
    insert into public.provider_events (user_id, event_type, conversation_id)
    values (a, 'limit_detected', 'de77de77-0000-4000-8000-000000000b02');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked,
    'provider_events/insert-conversation-chain: A can LOG an event referencing B''s conversation');
end $$;

-- ---------------------------------------------------------------------------
-- §12 Reference tables: readable by authenticated, never writable
-- ---------------------------------------------------------------------------

do $$
declare
  n integer;
  blocked boolean;
begin
  select count(*) into n from public.providers;
  perform pg_temp.ok(n >= 5, 'providers/select: authenticated users must be able to read provider reference data, saw ' || n);

  select count(*) into n from public.models;
  perform pg_temp.ok(n >= 7, 'models/select: authenticated users must be able to read model reference data, saw ' || n);

  select count(*) into n from public.models
   where capabilities ? 'api_model' and capabilities ->> 'api_model' <> '';
  perform pg_temp.ok(n >= 7, 'models/api_model: expected >= 7 models carrying an api_model mapping, saw ' || n);

  blocked := false;
  begin
    insert into public.providers (slug, name) values ('rogue', 'Rogue provider');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'providers/insert: reference data must not be writable by authenticated users');

  update public.providers set name = 'hijacked' where slug = 'claude';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'providers/update: reference data must not be updatable by authenticated users');

  delete from public.providers where slug = 'claude';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'providers/delete: reference data must not be deletable by authenticated users');

  blocked := false;
  begin
    insert into public.models (provider_id, external_id, name)
    select id, 'rogue-model', 'Rogue' from public.providers where slug = 'claude';
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'models/insert: reference data must not be writable by authenticated users');

  update public.models set name = 'hijacked' where external_id = 'claude-sonnet';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'models/update: reference data must not be updatable by authenticated users');

  delete from public.models where external_id = 'claude-sonnet';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'models/delete: reference data must not be deletable by authenticated users');
end $$;

-- ---------------------------------------------------------------------------
-- §13 storage — READ-ONLY policy-existence check.
--     Supabase forbids direct DML on storage tables ("Direct deletion from
--     storage tables is not allowed. Use the Storage API instead."), so the
--     behavioral matrix (upload/read/replace/delete, own vs cross-user) runs
--     through the REAL Storage API with real user JWTs in
--     supabase/tests/storage_rls_check.ts. Here we only verify the four
--     attachments ownership policies exist as migrated (catalog read).
-- ---------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname in (
       'attachments_storage_select_own',
       'attachments_storage_insert_own',
       'attachments_storage_update_own',
       'attachments_storage_delete_own'
     );
  perform pg_temp.ok(n = 4,
    'storage-policies/exist: expected the 4 attachments-bucket ownership policies on storage.objects, found ' || n ||
    ' — behavioral checks live in storage_rls_check.ts and mean nothing if the policies are missing');
end $$;

-- ---------------------------------------------------------------------------
-- §14 Symmetry: repeat the core isolation checks AS USER B, so a green run
--     cannot come from A simply having no data.
-- ---------------------------------------------------------------------------

do $$ begin perform pg_temp.become(current_setting('test.uid_b')); end $$;

do $$
declare
  n integer;
begin
  select count(*) into n from public.projects where id = 'de77de77-0000-4000-8000-000000000b01';
  perform pg_temp.ok(n = 1, 'symmetry/projects: B cannot read their own project');

  select count(*) into n from public.projects where id = 'de77de77-0000-4000-8000-000000000a01';
  perform pg_temp.ok(n = 0, 'symmetry/projects: B can READ A''s project');

  select count(*) into n from public.messages where id = 'de77de77-0000-4000-8000-000000000a03';
  perform pg_temp.ok(n = 0, 'symmetry/messages: B can READ A''s message');

  select count(*) into n from public.conversations where id = 'de77de77-0000-4000-8000-000000000a02';
  perform pg_temp.ok(n = 0, 'symmetry/conversations: B can READ A''s conversation');
  -- (storage symmetry moved to storage_rls_check.ts — SQL never writes
  -- storage fixtures, so there is nothing meaningful to read here.)
end $$;

-- ---------------------------------------------------------------------------
-- §15 Report + rollback
-- ---------------------------------------------------------------------------

reset role;

-- Guard: the suite must have executed EXACTLY the expected number of
-- assertions. A lower count means a section was skipped (e.g. only part of the
-- file was executed), which would otherwise produce a misleading PASS row.
do $$
declare
  total    integer := coalesce(current_setting('test.checks', true), '0')::int;
  expected constant integer := 110;
begin
  if total <> expected then
    raise exception
      'FAIL harness/assertion-count: executed % assertion(s), expected % — did the whole file run? Do NOT treat this as a pass.',
      total, expected;
  end if;
  raise notice 'RLS checks passed: %/% (all assertions green)', total, expected;
end $$;

-- Visible success row. The hosted Supabase SQL Editor surfaces SELECT result
-- sets but not RAISE NOTICE output, so the pass signal must be a result row.
-- assertions_passed is read from the live counter — never hard-coded — and the
-- guard above guarantees this row cannot be reached with a wrong count.
select
  'RLS_CHECKS_PASSED'::text                                        as status,
  coalesce(current_setting('test.checks', true), '0')::int         as assertions_passed,
  110                                                              as assertions_expected,
  'Now run supabase/tests/rls_cleanup_check.sql as a separate query'::text as next_step;

rollback;

-- ===========================================================================
-- Nothing follows the ROLLBACK on purpose.
-- Cleanup verification runs as a SEPARATE query: supabase/tests/rls_cleanup_check.sql
-- (read-only, self-contained, no temp tables / GUCs / transaction state).
-- ===========================================================================
