-- Security fix: complete the FK ownership chains on messages, conversations
-- and attachments (the four findings recorded in supabase/tests/README.md on
-- 2026-08-27; siblings of 20260825180000 and 20260825190000).
--
-- PRINCIPLE (docs/SECURITY.md): where a user-owned row references another
-- user-owned row, the policy must verify the parent belongs to auth.uid() —
-- on every command where the reference is writable, not only INSERT. All the
-- gaps below were integrity-only (every SELECT stays filtered by the reader's
-- own user_id, so nothing was disclosed), and the app's own write paths
-- already resolved these ids through RLS-visible queries — but a direct
-- PostgREST call with a guessed UUID bypassed that.
--
-- WHAT CHANGES
--   messages       INSERT + UPDATE(WITH CHECK): account_id must be NULL or an
--                  own connected_accounts row (conversation chain kept).
--   conversations  INSERT + UPDATE(WITH CHECK): project_id must be NULL or an
--                  own project; active_account_id must be NULL or an own
--                  connected account. active_provider_id / active_model_id
--                  reference GLOBAL tables (providers/models) and deliberately
--                  get no ownership check.
--   attachments    INSERT: message_id must be NULL or an own message in the
--                  SAME conversation as the attachment — the same-conversation
--                  clause stops an attachment from claiming conversation X
--                  while pointing at an own message from conversation Y.
--                  Attachments stay immutable: NO update policy is added.
--
-- WHAT DOES NOT CHANGE
--   Every SELECT and DELETE policy, and the USING clause of every UPDATE
--   policy (which rows may be targeted: only your own). Only the listed
--   INSERT policies and UPDATE WITH CHECK clauses (what a row may become)
--   are strengthened, so protection can only narrow.
--
-- LAYERING NOTE
--   messages_update_own is also recreated by the pending migration
--   20260825190000 (conversation chain only). That migration is committed and
--   is not edited; this one simply layers the account_id clause on top when it
--   runs after it. `drop policy if exists` keeps every step re-runnable and
--   order-safe.

-- ---------------------------------------------------------------------------
-- messages: INSERT
-- ---------------------------------------------------------------------------
drop policy if exists "messages_insert_own" on public.messages;

create policy "messages_insert_own"
  on public.messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.conversations c
       where c.id = conversation_id
         and c.user_id = auth.uid()
    )
    and (
      account_id is null
      or exists (
        select 1
          from public.connected_accounts ca
         where ca.id = account_id
           and ca.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- messages: UPDATE (USING preserved; WITH CHECK mirrors INSERT)
-- ---------------------------------------------------------------------------
drop policy if exists "messages_update_own" on public.messages;

create policy "messages_update_own"
  on public.messages for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.conversations c
       where c.id = conversation_id
         and c.user_id = auth.uid()
    )
    and (
      account_id is null
      or exists (
        select 1
          from public.connected_accounts ca
         where ca.id = account_id
           and ca.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- conversations: INSERT
-- ---------------------------------------------------------------------------
drop policy if exists "conversations_insert_own" on public.conversations;

create policy "conversations_insert_own"
  on public.conversations for insert
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
          from public.projects p
         where p.id = project_id
           and p.user_id = auth.uid()
      )
    )
    and (
      active_account_id is null
      or exists (
        select 1
          from public.connected_accounts ca
         where ca.id = active_account_id
           and ca.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- conversations: UPDATE (USING preserved; WITH CHECK mirrors INSERT)
-- ---------------------------------------------------------------------------
drop policy if exists "conversations_update_own" on public.conversations;

create policy "conversations_update_own"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
          from public.projects p
         where p.id = project_id
           and p.user_id = auth.uid()
      )
    )
    and (
      active_account_id is null
      or exists (
        select 1
          from public.connected_accounts ca
         where ca.id = active_account_id
           and ca.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- attachments: INSERT (rows remain immutable — no update policy exists or is
-- added; replace-by-delete-and-insert stays the only mutation path)
-- ---------------------------------------------------------------------------
drop policy if exists "attachments_insert_own" on public.attachments;

create policy "attachments_insert_own"
  on public.attachments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.conversations c
       where c.id = conversation_id
         and c.user_id = auth.uid()
    )
    and (
      message_id is null
      or exists (
        select 1
          from public.messages m
         where m.id = message_id
           and m.user_id = auth.uid()
           and m.conversation_id = attachments.conversation_id
      )
    )
  );
