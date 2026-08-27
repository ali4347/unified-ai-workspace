-- Security fix: enforce the FK ownership chains on INSERT of
-- public.provider_events — the last gap in the ownership-chain family
-- (supabase/tests/README.md, found by the 2026-08-27 post-fix re-audit;
-- completes the series 20260825180000 / 190000 / 200000).
--
-- ROOT CAUSE
--   provider_events_insert_own checked only `auth.uid() = user_id`, while the
--   row also carries two nullable references into user-owned tables:
--   account_id → connected_accounts and conversation_id → conversations.
--   A user could log an event in their own event stream referencing another
--   user's account or conversation UUID. Nothing is disclosed (SELECT stays
--   filtered by user_id) and rows are immutable after insert, but the event
--   log could carry cross-user references, which corrupts it as an audit
--   surface. provider_id references the global providers table and needs no
--   ownership check.
--
-- SCOPE
--   Only the INSERT policy is dropped and recreated. SELECT and DELETE are
--   untouched, and NO update policy is added — provider_events stays
--   append-only by design. `drop policy if exists` keeps this re-runnable.

drop policy if exists "provider_events_insert_own" on public.provider_events;

create policy "provider_events_insert_own"
  on public.provider_events for insert
  with check (
    auth.uid() = user_id
    and (
      account_id is null
      or exists (
        select 1
          from public.connected_accounts ca
         where ca.id = account_id
           and ca.user_id = auth.uid()
      )
    )
    and (
      conversation_id is null
      or exists (
        select 1
          from public.conversations c
         where c.id = conversation_id
           and c.user_id = auth.uid()
      )
    )
  );
