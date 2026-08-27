# Security tests

`rls_checks.sql` verifies the access-control guarantees the product promises: PRD §32 (RLS on every user-owned table), §33 (storage ownership), and §55/§59 ("unauthorized cross-user access tests fail"). It is the evidence behind the RLS line in the [release checklist](../../docs/SECURITY.md).

Run it after every migration push and before any release.

## What a green run proves

The suite prints `RLS checks passed: N/N`. That line only appears if **every** assertion below passed — there is no partial-pass path, and any failure aborts with a `FAIL <table>/<action>: …` message naming the exact policy surface that broke.

| Surface | Checks |
| --- | --- |
| `profiles` | read own ✔ / read other ✘ / update own ✔ / update other ✘ / delete own ✘ *(by design)* / delete other ✘ / insert-as-other ✘ |
| `connected_accounts` | read own ✔ / read other ✘ / update own ✔ / update other ✘ / delete other ✘ / insert-as-other ✘ |
| `projects` | full matrix: read, update, delete own ✔; read, update, delete other ✘; insert-as-other ✘ |
| `conversations` | full matrix (as projects) |
| `messages` | full matrix **plus** the conversation-ownership chain on INSERT *and* UPDATE: A may not insert into B's conversation, may not move an own message into B's conversation, may not reassign an own message's `user_id` to B — with a positive control that moving between two own conversations still works |
| `attachments` | read own ✔ / read other ✘ / update own ✘ *(immutable by design)* / update other ✘ / delete own ✔ / delete other ✘ / insert own ✔ / insert into B's conversation ✘ / insert-as-other ✘ |
| `extension_devices` | full matrix |
| `provider_sessions` | full matrix **plus** both ownership chains: a session may not reference another user's connected account or extension device, on INSERT or UPDATE, with a positive control that a fully-owned chain still works |
| `providers`, `models` | readable by any authenticated user ✔; insert/update/delete ✘; every model carries an `api_model` mapping |
| `storage.objects` (`attachments` bucket) | read own ✔ / read other ✘ / update own ✔ / update other ✘ / delete own ✔ / delete other ✘ / upload into own path ✔ / upload into another user's path ✘ |
| Symmetry | the core isolation checks are repeated as user B, so a green run cannot come from user A simply owning no data |
| Harness canary | asserts user A sees exactly one profile — if RLS were bypassed (running as owner, missing `FORCE ROW LEVEL SECURITY`), the whole suite would otherwise be a false green |
| Cleanup | no fixture row survived, no test storage object survived, `auth.users` unchanged, every table back to its pre-test count |

### Intended asymmetries

Three tables deliberately do **not** get a uniform CRUD matrix, and the suite asserts the *intended* behaviour rather than forcing symmetry:

- **`profiles` has no delete policy.** Nobody may delete a profile, including their own — profiles are removed by `ON DELETE CASCADE` when the auth user is deleted.
- **`attachments` has no update policy.** Attachments are immutable; replace by delete + insert.
- **`provider_events` has no update policy.** The event log is append-only.

If you ever add one of those policies, the corresponding assertion will fail — that is intentional. Update the test together with the policy, and record the decision in `docs/SECURITY.md`.

## Test identities (hosted-safe)

The suite **never inserts into `auth.users`.** Two reasons:

1. Every user-owned table has `user_id uuid references auth.users(id)`, so synthetic UUIDs would fail the foreign key.
2. `auth.users` is owned by GoTrue and its column set changes between releases, so hand-written rows are unsafe against a hosted project.

Instead it borrows the **two oldest existing `auth.users` rows** as identities A and B, and impersonates them exactly the way PostgREST does:

```sql
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
set local role authenticated;
```

`auth.uid()` reads that claim, and no policy joins to `auth.users`, so this is a faithful simulation of a real signed-in request. Fixture rows are created for both identities, exercised, and rolled back.

**Prerequisite: the project needs at least two auth users.** With fewer, the suite stops immediately with a setup error rather than testing something weaker. Create the second user through normal Supabase Auth (dashboard → Authentication → Add user, or a signup) — never by inserting into `auth.users` by hand.

Everything runs inside one transaction that ends in `ROLLBACK`, so borrowing production identities leaves their data untouched. PART 2 proves this by re-comparing every table count against a baseline captured before the transaction opened.

## How to run

The file is plain SQL and needs a session that can `SET ROLE authenticated` (i.e. connect as `postgres`/owner). It is **not** a migration — never put it in `supabase/migrations/`.

### Local Supabase

```bash
supabase start
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_checks.sql
```

### Hosted Supabase via psql / DB URL

Get the connection string from **Project Settings → Database → Connection string → URI** (use the session/direct connection, not the transaction pooler — the suite relies on session state and temp tables). Export it rather than pasting it inline so it stays out of your shell history:

```bash
export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_checks.sql
```

`ON_ERROR_STOP=1` matters: without it psql keeps going after a failed assertion and the exit code lies.

> The transaction pooler (port 6543) is **not** supported: it may hand statements to different backends, which breaks `SET LOCAL ROLE` and the temp baseline table.

### SQL Editor fallback

If you cannot get a direct connection, paste the whole file into the dashboard **SQL Editor** and run it once. It works there because the editor uses a single session.

Two caveats:

- Read the **Notices** pane, not just the results grid. The pass line (`RLS checks passed: N/N`), the cleanup confirmation and the `FINDING …` probe are all `RAISE NOTICE` output.
- Run the file whole. Executing only a highlighted fragment can leave the `begin;` open or skip the `rollback;`.

## Findings

### Resolved — `provider_sessions` ownership chain (2026-08-27)

The M3 policies checked only `user_id = auth.uid()`, so a user could create or update one of their own session rows to reference another user's `connected_account_id` or `device_id` if they learned that UUID. Reads stayed filtered by `user_id`, so nothing leaked — but it let one user's session records claim another user's account, which corrupts `provider_sessions` as an audit surface.

Fixed in `supabase/migrations/20260825180000_provider_sessions_ownership_chain.sql`, which rebuilds only the INSERT and UPDATE policies around the same `exists (…)` pattern `messages` and `attachments` have used since M3. SELECT and DELETE were left untouched. §11 of the suite now asserts both chains hard, on both INSERT and UPDATE, plus a positive control proving a fully-owned chain is still permitted (so the fix cannot pass by denying everything).

### Resolved — `messages` UPDATE conversation chain (2026-08-27)

`messages_insert_own` always required that the target conversation belong to the caller, but `messages_update_own` checked only `user_id` — and `conversation_id` is mutable, so a user could move one of their own messages into another user's conversation. Nothing was disclosed (the other user's `SELECT` is filtered by their own `user_id`), but the write side of the conversation boundary was open on UPDATE while closed on INSERT.

Fixed in `supabase/migrations/20260825190000_messages_update_ownership_chain.sql`: `USING` preserved verbatim, `WITH CHECK` strengthened to mirror the INSERT policy. §7 of the suite asserts the chain hard on UPDATE (move into B's conversation ✘, reassign `user_id` to B ✘) with a positive control (move between two own conversations ✔).

### Open — remaining unverified FK references (integrity-only, reported 2026-08-27)

A systematic audit of every mutable FK from a user-owned row into another user-owned parent found four more references that RLS does not verify. None is a disclosure — every read stays filtered by the reader's own `user_id` — and all are mitigated on the app's own write paths (`resolveSelection` and the project queries only resolve RLS-visible rows), but a direct PostgREST call with a guessed UUID bypasses that. Deliberately **not** fixed here; each needs a product-owner decision:

| Reference | Policies missing the check | Effect if abused |
| --- | --- | --- |
| `messages.account_id` → `connected_accounts` | INSERT and UPDATE | own message labeled with another user's account id |
| `conversations.project_id` → `projects` | INSERT and UPDATE | own conversation filed under another user's project (its owner never sees it) |
| `conversations.active_account_id` → `connected_accounts` | INSERT and UPDATE | own conversation's active-account pointer set to another user's account |
| `attachments.message_id` → `messages` | INSERT (immutable thereafter) | own attachment linked to another user's message id (`conversation_id` *is* verified) |

`provider_id` / `model_id` columns reference global reference tables and need no ownership check. If these are fixed, follow the established pattern: one forward-only migration per decision, then convert the corresponding suite coverage into hard assertions.
