-- Security fix: enforce the conversation-ownership chain on UPDATE of
-- public.messages (finding recorded in supabase/tests/README.md, 2026-08-27;
-- sibling of 20260825180000_provider_sessions_ownership_chain.sql).
--
-- ROOT CAUSE
--   messages_insert_own has always required that the target conversation
--   belong to the caller, but messages_update_own only checked user_id:
--
--     using (auth.uid() = user_id) with check (auth.uid() = user_id)
--
--   Because conversation_id is mutable, a user could UPDATE one of their own
--   messages and set conversation_id to another user's conversation. Nothing
--   is disclosed (the other user's SELECT is filtered by their own user_id,
--   so the moved row stays invisible to them), but the write side of the
--   conversation boundary was open: INSERT enforced it, UPDATE did not.
--
-- SCOPE
--   Only messages_update_own is dropped and recreated. SELECT, INSERT and
--   DELETE policies are untouched. USING is preserved verbatim (which rows
--   may be targeted: only your own); WITH CHECK is strengthened to mirror the
--   INSERT policy (what the row may become), so protection can only narrow.
--   `drop policy if exists` keeps the migration re-runnable.
--
--   Guarantees after this migration:
--     * the existing row must be owned by auth.uid()          (USING, unchanged)
--     * the updated row must still have user_id = auth.uid()  (WITH CHECK)
--     * the updated conversation_id must reference a conversation owned by
--       auth.uid()                                            (WITH CHECK)

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
  );
