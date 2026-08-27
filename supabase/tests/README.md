# Security tests

Three harnesses verify the access-control guarantees the product promises (PRD §32 RLS, §33 storage ownership, §55/§59 "unauthorized cross-user access tests fail"). They are the evidence behind the RLS line in the [release checklist](../../docs/SECURITY.md):

| Harness | Surface | Mechanism |
| --- | --- | --- |
| `rls_checks.sql` | **Database RLS** — every user-owned table + reference tables | SQL impersonation (`request.jwt.claims` + `SET LOCAL ROLE authenticated`), transactional, self-rolling-back. **110 assertions.** |
| `rls_cleanup_check.sql` | **Rollback / production-untouched proof** | Separate read-only query run after the suite — no temp tables, no GUCs, no transaction state |
| `storage_rls_check.ts` | **Storage authorization** — the private `attachments` bucket | The real Storage API with real user JWTs. **9 assertions.** |

**Why cleanup is a separate script:** the hosted SQL Editor gives no guarantee that session-local state survives a transaction boundary — an earlier design captured a baseline in a `TEMP` table before `BEGIN` and read it after `ROLLBACK`, which failed with `42P01: relation "_rls_baseline" does not exist`. The suite now depends on **nothing** after its `ROLLBACK`, and cleanup is proved independently from the live schema.

**Why the split:** Supabase protects storage tables from direct SQL mutation (`Direct deletion from storage tables is not allowed. Use the Storage API instead.`) because Storage metadata and the underlying object store must stay synchronized. Storage schema metadata is therefore treated as **read-only from SQL**, and direct `storage.objects` mutation is intentionally not tested by the SQL suite — it is not a path any real client can take. The SQL suite keeps one read-only check that the four attachments ownership policies exist; everything behavioral goes through the Storage API harness.

Run all three, in order (suite → cleanup check → storage harness), after every migration push and before any release.

**Last verified against production (2026-08-27):** `RLS_CHECKS_PASSED | 110 | 110` · `CLEANUP_VERIFIED` · `Storage authorization checks passed: 9/9`.

## What a green SQL run proves

The suite prints `RLS checks passed: N/N`. That line only appears if **every** assertion below passed — there is no partial-pass path, and any failure aborts with a `FAIL <table>/<action>: …` message naming the exact policy surface that broke.

| Surface | Checks |
| --- | --- |
| `profiles` | read own ✔ / read other ✘ / update own ✔ / update other ✘ / delete own ✘ *(by design)* / delete other ✘ / insert-as-other ✘ |
| `connected_accounts` | read own ✔ / read other ✘ / update own ✔ / update other ✘ / delete other ✘ / insert-as-other ✘ |
| `projects` | full matrix: read, update, delete own ✔; read, update, delete other ✘; insert-as-other ✘ |
| `conversations` | full matrix **plus** both reference chains on INSERT and UPDATE: `project_id` and `active_account_id` must be NULL or owned by the caller — with positive controls (own reference and NULL both succeed) |
| `messages` | full matrix **plus** every reference chain on INSERT *and* UPDATE: conversation must be owned (insert into / move into B's conversation ✘, reassign `user_id` to B ✘) and `account_id` must be NULL or owned (B's account ✘ on insert and update) — with positive controls (own conversation move, own account, NULL account all succeed) |
| `attachments` | read own ✔ / read other ✘ / update own ✘ *(immutable by design)* / update other ✘ / delete own ✔ / delete other ✘ / insert own ✔ / insert into B's conversation ✘ / insert-as-other ✘ / `message_id` chain: own message in same conversation ✔, NULL ✔, B's message ✘, own message from a *different* conversation ✘ |
| `extension_devices` | full matrix |
| `provider_sessions` | full matrix **plus** both ownership chains: a session may not reference another user's connected account or extension device, on INSERT or UPDATE, with a positive control that a fully-owned chain still works |
| `provider_events` | isolation matrix (read/delete own ✔, read/update/delete other ✘, insert-as-other ✘, update own ✘ *(append-only by design)*) **plus** both INSERT chains: `account_id` and `conversation_id` must be NULL or owned — own ✔, NULL ✔, B's account ✘, B's conversation ✘. *(This table had no coverage at all before 2026-08-27.)* |
| `providers`, `models` | readable by any authenticated user ✔; insert/update/delete ✘; every model carries an `api_model` mapping |
| storage policies (read-only) | the four `attachments_storage_*_own` policies exist on `storage.objects` as migrated — the behavioral matrix lives in `storage_rls_check.ts` |
| Symmetry | the core isolation checks are repeated as user B, so a green run cannot come from user A simply owning no data |
| Harness canary | asserts user A sees exactly one profile — if RLS were bypassed (running as owner, missing `FORCE ROW LEVEL SECURITY`), the whole suite would otherwise be a false green |
| Cleanup | proved by the separate `rls_cleanup_check.sql` (see the hosted flow below): no `de77de77-` fixture row or dangling reference, no `@example.invalid` identity, no mutated test value, reference data intact |

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

Everything runs inside one transaction that ends in `ROLLBACK`, so borrowing production identities leaves their data untouched. `rls_cleanup_check.sql` proves that afterwards, from the live schema, without depending on any state the suite left behind.

## How to run the SQL suite

The file is plain SQL and needs a session that can `SET ROLE authenticated` (i.e. connect as `postgres`/owner). It is **not** a migration — never put it in `supabase/migrations/`.

### Local Supabase

```bash
supabase start
DB=$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/rls_checks.sql
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/rls_cleanup_check.sql
```

### Hosted Supabase via psql / DB URL

Get the connection string from **Project Settings → Database → Connection string → URI** (use the session/direct connection, not the transaction pooler — the suite relies on `SET LOCAL ROLE` holding for the whole transaction). Export it rather than pasting it inline so it stays out of your shell history:

```bash
export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_checks.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_cleanup_check.sql
```

`ON_ERROR_STOP=1` matters: without it psql keeps going after a failed assertion and the exit code lies.

> The transaction pooler (port 6543) is **not** supported: it may hand statements to different backends, which breaks `SET LOCAL ROLE` and the `pg_temp` helper functions.

### Hosted Supabase SQL Editor — the standard flow

Run the two scripts as **two separate queries**, in order:

**Confirm success from the visible result row, not from notices.** The hosted SQL Editor surfaces `SELECT` result sets but does not reliably display `RAISE NOTICE` output, so each script ends by returning one row you can read directly in the results pane.

| Step | Action | Expect (results pane) |
| --- | --- | --- |
| 1 | Run `rls_checks.sql` whole | — |
| 2 | Confirm the returned row | `RLS_CHECKS_PASSED \| 110 \| 110` |
| 3 | Run `rls_cleanup_check.sql` as a **new query** | — |
| 4 | Confirm the returned row | `CLEANUP_VERIFIED \| 0 \| 0 \| 0` (+ post-test counts) |
| 5 | Later, separately, run `storage_rls_check.ts` for storage authorization | `Storage authorization checks passed: 9/9` (console) |

`assertions_passed` is read from the live `test.checks` counter — never hard-coded — and a guard raises if it is anything other than 110, so a partial run (e.g. only a highlighted fragment executed) fails loudly instead of returning a misleading PASS. If a script raises, **no row is returned**: an empty results pane means failure, and the error text names the exact assertion.

Step 3 must be a fresh query, not appended to step 1: the suite ends at `ROLLBACK` and deliberately leaves no session state behind.

#### Optional: manual count comparison

Step 1 emits a `Pre-test counts — …` notice and step 3 emits a matching `Post-test counts — …` notice. The production-untouched guarantee does not depend on them (see below), but comparing the two lines gives an explicit numeric confirmation if you want one.

The primary guarantee is stronger than counts: `rls_cleanup_check.sql` proves the absence of **every deterministic fixture identifier** — the `de77de77-` uuid prefix across all eight seeded tables, dangling `de77de77-` references in mutable FK columns, the reserved `@example.invalid` marker addresses, and the fixed vocabulary of literals the UPDATE assertions write (`hijacked`, `A renamed`, `A edited`, `rewritten`, …). That last group matters because an in-place UPDATE changes no row count, so counts alone could not detect it. Combined with the facts that the suite never writes `auth.users` and never writes the `providers`/`models` reference tables, that establishes the guarantee without any pre-test snapshot needing to survive the rollback.

### SQL Editor notes

- Judge success by the **returned row**, not the Notices pane — notices are emitted too, but the hosted Editor may not show them.
- Run each file **whole**. Executing only a highlighted fragment can leave the `begin;` open or skip the `rollback;`.
- Do not rely on session state between the two scripts — by design there is none.

## Storage authorization harness (`storage_rls_check.ts`)

A manual E2E check that exercises the **real Storage API** against the private `attachments` bucket with **real user JWTs** — never the service-role key, so RLS is genuinely evaluated. It verifies, with two distinct users:

- **Own path:** A can upload, download, replace (content verified) and delete (verified gone) under `{their-uid}/…`.
- **Cross-user:** A cannot download, replace, or delete B's object, and cannot upload into B's ownership path. Every denial is re-verified from B's side — the Storage API can report "success with nothing done" when RLS filters silently (e.g. `remove()` of an invisible object), so error objects alone are never trusted.

Safeguards: every object lives under a unique per-run prefix `{uid}/rls-e2e/{runId}/` (no production path is ever reused); cleanup runs in `finally` through the Storage API, each user removing their own prefix; the cleanup result is reported separately from the PASS/FAIL verdict; leftover objects are named explicitly if cleanup fails.

### Running it

```bash
# from the repo root
npx -y tsx supabase/tests/storage_rls_check.ts
```

Project URL and anon key are read from `UAW_SUPABASE_URL` / `UAW_SUPABASE_ANON_KEY`, falling back to the `NEXT_PUBLIC_*` values in `apps/web/.env.local` (both are public values).

### Providing the two authenticated sessions (credentials never touch git)

The harness refuses to run without credentials and prints these options. Supply them via **environment variables only** — never files, never commits:

1. **Two throwaway email+password users** (recommended): Dashboard → Authentication → Add user, twice; export `UAW_TEST_EMAIL_A`/`UAW_TEST_PASSWORD_A` and `UAW_TEST_EMAIL_B`/`UAW_TEST_PASSWORD_B`; delete both users when done. Don't reuse real accounts' passwords.
2. **Two pre-minted access tokens** from signed-in sessions: export `UAW_TEST_JWT_A`/`UAW_TEST_JWT_B`. User JWTs are short-lived; mint them just before running.

The script aborts if both identities resolve to the same account, and never prints or persists any credential. The service-role key is not accepted anywhere in this harness.

## Findings

### Resolved — `provider_sessions` ownership chain (2026-08-27)

The M3 policies checked only `user_id = auth.uid()`, so a user could create or update one of their own session rows to reference another user's `connected_account_id` or `device_id` if they learned that UUID. Reads stayed filtered by `user_id`, so nothing leaked — but it let one user's session records claim another user's account, which corrupts `provider_sessions` as an audit surface.

Fixed in `supabase/migrations/20260825180000_provider_sessions_ownership_chain.sql`, which rebuilds only the INSERT and UPDATE policies around the same `exists (…)` pattern `messages` and `attachments` have used since M3. SELECT and DELETE were left untouched. §11 of the suite now asserts both chains hard, on both INSERT and UPDATE, plus a positive control proving a fully-owned chain is still permitted (so the fix cannot pass by denying everything).

### Resolved — `messages` UPDATE conversation chain (2026-08-27)

`messages_insert_own` always required that the target conversation belong to the caller, but `messages_update_own` checked only `user_id` — and `conversation_id` is mutable, so a user could move one of their own messages into another user's conversation. Nothing was disclosed (the other user's `SELECT` is filtered by their own `user_id`), but the write side of the conversation boundary was open on UPDATE while closed on INSERT.

Fixed in `supabase/migrations/20260825190000_messages_update_ownership_chain.sql`: `USING` preserved verbatim, `WITH CHECK` strengthened to mirror the INSERT policy. §7 of the suite asserts the chain hard on UPDATE (move into B's conversation ✘, reassign `user_id` to B ✘) with a positive control (move between two own conversations ✔).

### Resolved — remaining FK reference chains on messages, conversations, attachments (2026-08-27)

The four gaps found by the first systematic FK audit are closed by `supabase/migrations/20260825200000_complete_fk_ownership_chains.sql` and covered by hard assertions:

| Reference | Fixed on | Suite coverage |
| --- | --- | --- |
| `messages.account_id` → `connected_accounts` | INSERT + UPDATE | §7: own ✔, NULL ✔, B's account ✘ on insert and update |
| `conversations.project_id` → `projects` | INSERT + UPDATE | §6b: own ✔, NULL ✔, B's project ✘ on insert and update |
| `conversations.active_account_id` → `connected_accounts` | INSERT + UPDATE | §6b: own ✔, NULL ✔, B's account ✘ on insert and update |
| `attachments.message_id` → `messages` | INSERT (rows stay immutable) | §8: own message in same conversation ✔, NULL ✔, B's message ✘, own message from a different conversation ✘ |

The attachments policy also enforces that the referenced message live in the **same conversation** as the attachment, so an attachment cannot claim conversation X while pointing at an own message from conversation Y. `provider_id`/`model_id` columns reference global tables and need no ownership check. USING clauses, SELECT and DELETE policies were untouched, and attachments remain immutable.

### Resolved — `provider_events` INSERT references (2026-08-27)

The last gap in the family: `provider_events_insert_own` checked only `user_id = auth.uid()`, while the row's nullable `account_id` and `conversation_id` were unverified on INSERT (the only writable path — rows are immutable). Fixed by `supabase/migrations/20260825210000_provider_events_ownership_chain.sql` with the standard NULL-or-owned pattern; SELECT and DELETE untouched, no UPDATE policy added.

§11b covers both chains with positive controls (own references ✔, NULL ✔, B's account ✘, B's conversation ✘) — and also adds the `provider_events` isolation matrix, which the 2026-08-27 suite expansion had **missed entirely**: before this, a green run said nothing about `provider_events` at all. The coverage table above is now complete for every user-owned table.

**Ownership-chain family: closed.** The final audit (composing policy state across all migrations in order) shows every mutable FK from a user-owned row into a user-owned parent is chained: `messages` (conversations, connected_accounts — INSERT+UPDATE), `conversations` (projects, connected_accounts — INSERT+UPDATE), `attachments` (conversations, messages incl. same-conversation — INSERT, immutable), `provider_sessions` (connected_accounts, extension_devices — INSERT+UPDATE), `provider_events` (connected_accounts, conversations — INSERT, immutable). Any new table or newly mutable FK must follow the same pattern and gain suite assertions in the same change.
