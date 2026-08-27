-- Security fix: enforce the ownership chain on public.provider_sessions
-- (finding raised by supabase/tests/rls_checks.sql §11, 2026-08-27).
--
-- ROOT CAUSE
--   The Milestone 3 policies verified only `auth.uid() = user_id`:
--
--     insert ... with check (auth.uid() = user_id)
--     update ... using  (auth.uid() = user_id)
--            ... with check (auth.uid() = user_id)
--
--   but the row also carries two foreign keys into other user-owned tables —
--   `connected_account_id` (not null → public.connected_accounts) and
--   `device_id` (nullable → public.extension_devices). Neither was checked, so
--   a user could create or update one of their OWN session rows to reference
--   another user's connected account or extension device, provided they knew
--   the uuid. No data belonging to the other user is readable this way (SELECT
--   is still filtered by user_id), so this was an integrity gap rather than a
--   disclosure — but it let one user's session records claim another user's
--   account, which corrupts provider_sessions as an audit surface.
--
--   public.messages and public.attachments already got this right at M3 by
--   pairing the owner check with an `exists (...)` clause on the parent row.
--   This migration applies the same pattern here.
--
-- SCOPE
--   Only the two provider_sessions policies that were wrong are dropped and
--   recreated. SELECT and DELETE are deliberately left untouched — they were
--   never weak, and reissuing them would risk widening the change.
--   `drop policy if exists` + `create policy` makes this re-runnable.
--
--   The UPDATE policy keeps its original USING clause (which rows may be
--   targeted: only your own) and strengthens only WITH CHECK (what the row is
--   allowed to become), so this cannot reduce protection.

-- ---------------------------------------------------------------------------
-- INSERT: owner + both ownership chains
-- ---------------------------------------------------------------------------
drop policy if exists "provider_sessions_insert_own" on public.provider_sessions;

create policy "provider_sessions_insert_own"
  on public.provider_sessions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.connected_accounts ca
       where ca.id = connected_account_id
         and ca.user_id = auth.uid()
    )
    and (
      device_id is null
      or exists (
        select 1
          from public.extension_devices d
         where d.id = device_id
           and d.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE: unchanged USING (own rows only), strengthened WITH CHECK
-- ---------------------------------------------------------------------------
drop policy if exists "provider_sessions_update_own" on public.provider_sessions;

create policy "provider_sessions_update_own"
  on public.provider_sessions for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.connected_accounts ca
       where ca.id = connected_account_id
         and ca.user_id = auth.uid()
    )
    and (
      device_id is null
      or exists (
        select 1
          from public.extension_devices d
         where d.id = device_id
           and d.user_id = auth.uid()
      )
    )
  );

comment on table public.provider_sessions is
  'Session state metadata only — never provider credentials or cookies (PRD §19, §31). INSERT/UPDATE enforce that user_id, connected_account_id and device_id all belong to the caller.';
