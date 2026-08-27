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
| `provider_sessions` | full matrix (+ an ownership-chain probe, see Open findings) |
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

## Open findings

**`provider_sessions` ownership chain (open).** The insert policy checks `user_id = auth.uid()` but does not verify that `connected_account_id` belongs to the caller, so a user could create a session row pointing at another user's account id if they somehow learned that UUID. No data belonging to the other user is exposed — reads are still filtered by `user_id` — so this is an integrity gap, not a leak.

§11 of the suite **probes** this and reports the live behaviour as a `NOTICE` instead of asserting it, so the suite neither hides the gap nor fails on a policy question the product owner has not yet ruled on. Closing it means adding an `exists (select 1 from connected_accounts …)` clause to the insert policy in a new migration — the same shape `messages` and `attachments` already use — and then converting the probe into a hard assertion.
