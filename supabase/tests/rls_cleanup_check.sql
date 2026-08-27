-- ===========================================================================
-- Cleanup verification for rls_checks.sql — RUN THIS AS A SEPARATE QUERY,
-- after the main suite has reported "RLS checks passed: 110/110".
--
-- WHY IT IS SEPARATE: the hosted Supabase SQL Editor gives no guarantee that
-- session-local state (temp tables, GUCs, transaction state) survives across a
-- transaction boundary, so the main suite deliberately depends on NOTHING
-- after its ROLLBACK. This script is fully self-contained: it reads no temp
-- table, no GUC and no prior state — only the live schema.
--
-- IT IS READ-ONLY. It contains no INSERT/UPDATE/DELETE/DDL of any kind and
-- cannot mutate production data. It creates no scratch table.
--
-- WHAT IT PROVES, and why that is sufficient:
--   1. No fixture row survives. Every row the suite inserts carries a
--      deterministic id with the prefix 'de77de77-' — absence of that prefix
--      across all eight fixture tables proves the INSERTs rolled back.
--   2. No test identity was created. The suite never writes auth.users (it
--      borrows two existing users); this re-verifies that no user or profile
--      carries the reserved @example.invalid marker addresses.
--   3. No mutated value survives. The suite's UPDATE assertions write a fixed
--      vocabulary of literals ('hijacked', 'A renamed', 'A edited', …) into
--      production-shaped columns. Their absence proves the UPDATEs rolled back
--      — this is the part a row-count comparison alone would miss, since an
--      in-place UPDATE does not change any count.
--   Together with the facts that the suite never writes auth.users and never
--   writes the providers/models reference tables, this establishes the
--   production-data-untouched guarantee without needing a pre-test snapshot to
--   survive the rollback.
--
-- Success is confirmed from ONE VISIBLE RESULT ROW (the hosted SQL Editor
-- surfaces SELECT result sets but not RAISE NOTICE output):
--
--     status            | fixture_rows | test_identities | mutated_values
--     CLEANUP_VERIFIED  | 0            | 0               | 0
--
-- Any failure raises with the exact table and marker that leaked, and no row is
-- returned.
-- ===========================================================================

do $$
declare
  n            integer;
  leaked       integer := 0;
  details      text    := '';
  -- Literals written by the suite's UPDATE assertions (see rls_checks.sql).
  hijack_words text[]  := array['hijacked', 'A renamed', 'A edited', 'rewritten'];
begin
  -- -------------------------------------------------------------------------
  -- 1. No fixture rows (uuid prefix 'de77de77-') in any table the suite seeds.
  -- -------------------------------------------------------------------------
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
    -- Name the offending tables so the operator does not have to hunt.
    select string_agg(t || '=' || c::text, ', ')
      into details
      from (
        select 'connected_accounts' as t, count(*) as c from public.connected_accounts where id::text like 'de77de77-%'
        union all select 'projects',          count(*) from public.projects          where id::text like 'de77de77-%'
        union all select 'conversations',     count(*) from public.conversations     where id::text like 'de77de77-%'
        union all select 'messages',          count(*) from public.messages          where id::text like 'de77de77-%'
        union all select 'attachments',       count(*) from public.attachments       where id::text like 'de77de77-%'
        union all select 'provider_sessions', count(*) from public.provider_sessions where id::text like 'de77de77-%'
        union all select 'extension_devices', count(*) from public.extension_devices where id::text like 'de77de77-%'
        union all select 'provider_events',   count(*) from public.provider_events   where id::text like 'de77de77-%'
      ) x
     where c > 0;
    raise exception 'CLEANUP FAIL: % fixture row(s) survived the rollback (%)', leaked, details;
  end if;

  -- Also catch fixture references left dangling in mutable FK columns.
  select
      (select count(*) from public.messages      where conversation_id::text like 'de77de77-%' or account_id::text like 'de77de77-%')
    + (select count(*) from public.conversations where project_id::text like 'de77de77-%' or active_account_id::text like 'de77de77-%')
    + (select count(*) from public.attachments   where conversation_id::text like 'de77de77-%' or message_id::text like 'de77de77-%')
    into n;
  if n <> 0 then
    raise exception 'CLEANUP FAIL: % production row(s) still reference a de77de77- fixture id', n;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. No test identities. The suite never writes auth.users; the reserved
  --    @example.invalid marker addresses must appear nowhere.
  -- -------------------------------------------------------------------------
  select count(*) into n from auth.users where email like '%@example.invalid';
  if n <> 0 then
    raise exception 'CLEANUP FAIL: % auth.users row(s) carry a reserved @example.invalid address — the suite must never create users', n;
  end if;

  select count(*) into n from public.profiles where email like '%@example.invalid';
  if n <> 0 then
    raise exception 'CLEANUP FAIL: % profiles row(s) carry a reserved @example.invalid address', n;
  end if;

  select count(*) into n from public.connected_accounts where email like '%@example.invalid';
  if n <> 0 then
    raise exception 'CLEANUP FAIL: % connected_accounts row(s) carry a reserved @example.invalid address', n;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. No mutated values survive. UPDATEs change no row count, so this is the
  --    check that actually proves the UPDATE assertions rolled back.
  -- -------------------------------------------------------------------------
  select count(*) into n from public.profiles           where display_name = any (hijack_words);
  if n <> 0 then raise exception 'CLEANUP FAIL: % profiles row(s) retain a test display_name', n; end if;

  select count(*) into n from public.connected_accounts where display_name = any (hijack_words);
  if n <> 0 then raise exception 'CLEANUP FAIL: % connected_accounts row(s) retain a test display_name', n; end if;

  select count(*) into n from public.projects           where name = any (hijack_words) or name in ('A project', 'A project (delete target)', 'B project');
  if n <> 0 then raise exception 'CLEANUP FAIL: % projects row(s) retain a test name', n; end if;

  select count(*) into n from public.conversations      where title = any (hijack_words)
                                                           or title in ('A conversation', 'A conversation (delete target)', 'A second conversation',
                                                                        'A chained conversation', 'A null-chain conversation', 'B conversation');
  if n <> 0 then raise exception 'CLEANUP FAIL: % conversations row(s) retain a test title', n; end if;

  select count(*) into n from public.messages           where content = any (hijack_words)
                                                           or content in ('A secret message', 'B secret message', 'A delete target',
                                                                          'A new message', 'no account', 'reply via A account');
  if n <> 0 then raise exception 'CLEANUP FAIL: % messages row(s) retain test content', n; end if;

  select count(*) into n from public.attachments        where file_name in ('renamed.txt', 'hijacked.txt', 'a.txt', 'b.txt', 'a-del.txt',
                                                                           'new.txt', 'linked.txt', 'unlinked.txt');
  if n <> 0 then raise exception 'CLEANUP FAIL: % attachments row(s) retain a test file_name', n; end if;

  select count(*) into n from public.extension_devices  where device_name = any (hijack_words) or device_name in ('A laptop', 'A laptop (delete target)', 'B laptop');
  if n <> 0 then raise exception 'CLEANUP FAIL: % extension_devices row(s) retain a test device_name', n; end if;

  select count(*) into n from public.provider_events    where event_type = any (hijack_words);
  if n <> 0 then raise exception 'CLEANUP FAIL: % provider_events row(s) retain a mutated event_type — the log must be append-only', n; end if;

  select count(*) into n from public.attachments        where storage_path like '%/rls-check/%';
  if n <> 0 then raise exception 'CLEANUP FAIL: % attachments row(s) retain a test storage_path', n; end if;

  -- -------------------------------------------------------------------------
  -- 4. Reference data intact (the suite asserts these are NOT writable; if an
  --    assertion had wrongly succeeded, the rollback still removed it — this
  --    confirms the tables are whole).
  -- -------------------------------------------------------------------------
  select count(*) into n from public.providers where slug = 'rogue' or name = 'hijacked';
  if n <> 0 then raise exception 'CLEANUP FAIL: providers reference data was modified by the suite', n; end if;

  select count(*) into n from public.models where external_id = 'rogue-model' or name = 'hijacked';
  if n <> 0 then raise exception 'CLEANUP FAIL: models reference data was modified by the suite', n; end if;

  raise notice 'Cleanup verified: no RLS fixture rows remain.';
end $$;

-- Visible success row. Reaching this SELECT at all means every check above
-- passed (each raises on failure); the zero columns are re-counted live rather
-- than asserted constants, and the post-test counts are returned as columns for
-- optional comparison against the "Pre-test counts" notice from rls_checks.sql.
select
  'CLEANUP_VERIFIED'::text as status,
  (select count(*) from public.connected_accounts where id::text like 'de77de77-%')
  + (select count(*) from public.projects          where id::text like 'de77de77-%')
  + (select count(*) from public.conversations     where id::text like 'de77de77-%')
  + (select count(*) from public.messages          where id::text like 'de77de77-%')
  + (select count(*) from public.attachments       where id::text like 'de77de77-%')
  + (select count(*) from public.provider_sessions where id::text like 'de77de77-%')
  + (select count(*) from public.extension_devices where id::text like 'de77de77-%')
  + (select count(*) from public.provider_events   where id::text like 'de77de77-%')   as fixture_rows,
  (select count(*) from auth.users where email like '%@example.invalid')
  + (select count(*) from public.profiles where email like '%@example.invalid')        as test_identities,
  (select count(*) from public.conversations where title in ('hijacked', 'A renamed'))
  + (select count(*) from public.messages    where content in ('hijacked', 'A edited')) as mutated_values,
  (select count(*) from auth.users)          as auth_users,
  (select count(*) from public.profiles)     as profiles,
  (select count(*) from public.projects)     as projects,
  (select count(*) from public.conversations) as conversations,
  (select count(*) from public.messages)     as messages;
