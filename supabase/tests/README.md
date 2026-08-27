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
| `messages` | full matrix **plus** the conversation-ownership chain: A may not insert into B's conversation even with their own `user_id` |
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

### Open — `messages` UPDATE does not re-check the conversation chain

Noticed while fixing the above, **not** changed here because it is outside the approved scope and `messages` is on a live write path.

`messages_insert_own` correctly requires that the target conversation belongs to the caller, but `messages_update_own` is only `using (auth.uid() = user_id) with check (auth.uid() = user_id)`. A user can therefore update one of their own messages to set `conversation_id` to another user's conversation. As with the resolved finding, nothing is disclosed — the other user's `SELECT` is filtered by their own `user_id`, so they never see the moved row — and the mover only relocates a message they already own. It is an integrity gap in the same family.

Closing it would mean a new migration adding the same `exists (…)` clause to the UPDATE policy's `WITH CHECK`. Worth a decision before the extension starts writing session/message rows.
