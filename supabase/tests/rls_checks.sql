-- ===========================================================================
-- RLS + storage isolation verification suite
-- PRD §32 (RLS), §55 / §59 ("unauthorized cross-user access tests fail"), §33
-- (storage ownership). See supabase/tests/README.md for how to run this.
-- ===========================================================================
--
-- SAFETY MODEL
--
--   * The whole suite runs inside ONE transaction that always ends in ROLLBACK.
--     No fixture row, storage object or policy change survives it.
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
--   * Fixture rows all share the uuid prefix 'de77de77-...' so PART 2 can prove
--     none of them survived the rollback.
--   * PART 2 re-checks every table count against a baseline captured in PART 0
--     to prove production data was untouched.
--
-- A GREEN RUN MEANS: every assertion below passed. The suite prints
-- "RLS checks passed: N/N" — if the run ends any other way, treat it as a
-- failure and do NOT weaken any policy to make it pass.
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
--   * provider_sessions enforced only `user_id = auth.uid()`, letting a user
--     point their own session rows at another user's connected account or
--     extension device. Fixed by 20260825180000; §11 asserts both chains hard,
--     on INSERT and UPDATE, with a positive control.
--   * messages enforced the conversation chain on INSERT but not UPDATE, so a
--     user could move their own message into another user's conversation.
--     Fixed by 20260825190000; §7 asserts the UPDATE chain hard, with a
--     positive control (moving between two own conversations still works).
--   Further open findings of the same family are listed in
--   supabase/tests/README.md → Findings.
-- ===========================================================================


-- ===========================================================================
-- PART 0 — baseline snapshot
-- Runs OUTSIDE the test transaction, so the temp table survives the rollback
-- and PART 2 can compare against it.
-- ===========================================================================

drop table if exists _rls_baseline;

create temp table _rls_baseline as
select
  (select count(*) from auth.users)                                        as auth_users,
  (select count(*) from public.profiles)                                   as profiles,
  (select count(*) from public.connected_accounts)                         as connected_accounts,
  (select count(*) from public.projects)                                   as projects,
  (select count(*) from public.conversations)                              as conversations,
  (select count(*) from public.messages)                                   as messages,
  (select count(*) from public.attachments)                                as attachments,
  (select count(*) from public.provider_sessions)                          as provider_sessions,
  (select count(*) from public.extension_devices)                          as extension_devices,
  (select count(*) from public.provider_events)                            as provider_events,
  (select count(*) from public.providers)                                  as providers,
  (select count(*) from public.models)                                     as models,
  (select count(*) from storage.objects where bucket_id = 'attachments')   as storage_objects;


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

  -- storage objects under {user_id}/… (the ownership convention the policies enforce)
  insert into storage.objects (id, bucket_id, name)
  values
    ('de77de77-0000-4000-8000-0000000000f1', 'attachments', a::text || '/rls-check/a.txt'),
    ('de77de77-0000-4000-8000-0000000000f2', 'attachments', b::text || '/rls-check/b.txt');
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
select pg_temp.become(current_setting('test.uid_a'));

-- Harness canary: if RLS were bypassed (e.g. still running as owner, or FORCE
-- RLS missing), user A would see BOTH profiles and every check below would be a
-- false green. Assert the boundary is real before testing anything else.
do $$
declare
  visible integer;
  total   integer;
begin
  select count(*) into visible from public.profiles;
  select auth_users into total from _rls_baseline;
  perform pg_temp.ok(
    visible = 1,
    'harness/canary: user A should see exactly 1 profile under RLS but saw ' || visible ||
    ' — RLS is NOT being enforced for this session, so no result below is trustworthy'
  );
  perform pg_temp.ok(
    total >= 2,
    'harness/canary: expected >= 2 auth users to borrow, baseline has ' || total
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
-- §13 storage.objects — private `attachments` bucket, {user_id}/… ownership
-- ---------------------------------------------------------------------------

do $$
declare
  a uuid := current_setting('test.uid_a')::uuid;
  b uuid := current_setting('test.uid_b')::uuid;
  n integer;
  blocked boolean := false;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'attachments' and name = a::text || '/rls-check/a.txt';
  perform pg_temp.ok(n = 1, 'storage/select-own: A cannot read their own object in the attachments bucket');

  select count(*) into n from storage.objects
   where bucket_id = 'attachments' and name = b::text || '/rls-check/b.txt';
  perform pg_temp.ok(n = 0, 'storage/select-other: A can READ B''s object in the attachments bucket');

  update storage.objects set metadata = '{"tampered":true}'::jsonb
   where bucket_id = 'attachments' and name = b::text || '/rls-check/b.txt';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'storage/update-other: A can UPDATE B''s stored object');

  delete from storage.objects
   where bucket_id = 'attachments' and name = b::text || '/rls-check/b.txt';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'storage/delete-other: A can DELETE B''s stored object');

  -- upload into B's ownership path
  begin
    insert into storage.objects (bucket_id, name)
    values ('attachments', b::text || '/rls-check/planted.txt');
  exception when insufficient_privilege then blocked := true;
  end;
  perform pg_temp.ok(blocked, 'storage/insert-other-path: A can UPLOAD into B''s ownership path');

  -- own path round-trip
  insert into storage.objects (bucket_id, name)
  values ('attachments', a::text || '/rls-check/own-upload.txt');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'storage/insert-own-path: A cannot upload into their own ownership path');

  update storage.objects set metadata = '{"ok":true}'::jsonb
   where bucket_id = 'attachments' and name = a::text || '/rls-check/own-upload.txt';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'storage/update-own: A cannot update their own stored object');

  delete from storage.objects
   where bucket_id = 'attachments' and name = a::text || '/rls-check/own-upload.txt';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'storage/delete-own: A cannot delete their own stored object');
end $$;

-- ---------------------------------------------------------------------------
-- §14 Symmetry: repeat the core isolation checks AS USER B, so a green run
--     cannot come from A simply having no data.
-- ---------------------------------------------------------------------------

select pg_temp.become(current_setting('test.uid_b'));

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

  select count(*) into n from storage.objects
   where bucket_id = 'attachments'
     and name = current_setting('test.uid_a') || '/rls-check/a.txt';
  perform pg_temp.ok(n = 0, 'symmetry/storage: B can READ A''s stored object');
end $$;

-- ---------------------------------------------------------------------------
-- §15 Report + rollback
-- ---------------------------------------------------------------------------

reset role;

do $$
declare
  total integer := current_setting('test.checks', true)::int;
begin
  raise notice '-------------------------------------------------------------';
  raise notice 'RLS checks passed: %/% (all assertions green)', total, total;
  raise notice 'Rolling back — no fixture row or storage object is retained.';
  raise notice '-------------------------------------------------------------';
end $$;

rollback;


-- ===========================================================================
-- PART 2 — post-rollback verification (requirement: nothing survived)
-- ===========================================================================

do $$
declare
  leaked integer;
  b      _rls_baseline%rowtype;
begin
  select * into b from _rls_baseline;

  -- 2a. No fixture row survived. Every fixture uuid starts 'de77de77-'.
  select
      (select count(*) from public.connected_accounts where id::text like 'de77de77-%')
    + (select count(*) from public.projects            where id::text like 'de77de77-%')
    + (select count(*) from public.conversations       where id::text like 'de77de77-%')
    + (select count(*) from public.messages            where id::text like 'de77de77-%')
    + (select count(*) from public.attachments         where id::text like 'de77de77-%')
    + (select count(*) from public.provider_sessions   where id::text like 'de77de77-%')
    + (select count(*) from public.extension_devices   where id::text like 'de77de77-%')
    + (select count(*) from public.provider_events     where id::text like 'de77de77-%')
    into leaked;
  if leaked <> 0 then
    raise exception 'CLEANUP FAIL: % fixture row(s) survived the rollback', leaked;
  end if;

  -- 2b. No test storage object survived.
  select count(*) into leaked from storage.objects
   where bucket_id = 'attachments' and name like '%/rls-check/%';
  if leaked <> 0 then
    raise exception 'CLEANUP FAIL: % test storage object(s) survived the rollback', leaked;
  end if;

  -- 2c. No test identity was created — auth.users must be unchanged.
  if (select count(*) from auth.users) <> b.auth_users then
    raise exception 'CLEANUP FAIL: auth.users changed (% -> %) — the suite must never create users',
      b.auth_users, (select count(*) from auth.users);
  end if;

  -- 2d. Production data untouched: every table back to its baseline count.
  if (select count(*) from public.profiles)           <> b.profiles
  or (select count(*) from public.connected_accounts) <> b.connected_accounts
  or (select count(*) from public.projects)           <> b.projects
  or (select count(*) from public.conversations)      <> b.conversations
  or (select count(*) from public.messages)           <> b.messages
  or (select count(*) from public.attachments)        <> b.attachments
  or (select count(*) from public.provider_sessions)  <> b.provider_sessions
  or (select count(*) from public.extension_devices)  <> b.extension_devices
  or (select count(*) from public.provider_events)    <> b.provider_events
  or (select count(*) from public.providers)          <> b.providers
  or (select count(*) from public.models)             <> b.models
  or (select count(*) from storage.objects where bucket_id = 'attachments') <> b.storage_objects
  then
    raise exception 'CLEANUP FAIL: at least one table count differs from the pre-test baseline';
  end if;

  raise notice 'Cleanup verified: no fixture rows, no test storage objects, auth.users unchanged, all table counts match the pre-test baseline.';
end $$;


-- ===========================================================================
-- PART 3 — drop the baseline scratch table
-- ===========================================================================

drop table if exists _rls_baseline;
