# Security

Binding rules from PRD §5, §7, §19, §32, §48, §59, §61–62. Violations block release.

## Credentials

- **Never** store external AI-provider passwords (Claude, ChatGPT, Google, Microsoft, Perplexity) — no database column, no log line, no form field that accepts them (PRD §19). The schema deliberately has no password field on `connected_accounts`.
- **Never** copy raw long-lived provider authentication cookies into Supabase or any backend store. Provider auth stays in the user's browser or a provider-supported mechanism.
- Portal auth is Supabase Auth only (Google OAuth, email magic link). Portal identity and provider identities are independent.
- Secrets only via environment variables. `.env*` is git-ignored; only `.env.example` (empty values) is committed. `SUPABASE_SERVICE_ROLE_KEY` must never appear in client bundles — no `NEXT_PUBLIC_` prefix, no import into client components.

## Database

- RLS enabled on every user-owned table **before the feature is considered done** (PRD rule 10). Current: `profiles`, `connected_accounts`, `projects`, `conversations`, `messages`, `attachments`, `provider_sessions`, `extension_devices`, `provider_events` (owner-only policies on `auth.uid()`); `providers`/`models` are read-only reference tables (select for authenticated, writes only via migrations/service role). `messages`/`attachments` inserts additionally verify ownership of the target conversation.
- Storage: private `attachments` bucket; object policies require the first path segment to equal `auth.uid()`.
- The signup trigger (`handle_new_user`) is `security definer` with an empty `search_path` to avoid search-path hijacking.
- Ownership chains: where a user-owned row points at another user-owned row, the policy must verify the parent is NULL or owned by `auth.uid()` — on every command where the reference is writable, not only INSERT. Enforced across the **entire schema** by `20260825180000` (provider_sessions → connected_accounts, extension_devices), `20260825190000` (messages → conversations on UPDATE), `20260825200000` (messages → connected_accounts; conversations → projects, connected_accounts; attachments → messages, which must additionally live in the same conversation as the attachment) and `20260825210000` (provider_events → connected_accounts, conversations). The final FK audit shows zero unresolved chain gaps; every chain is covered by hard assertions in `supabase/tests/rls_checks.sql`. New tables or newly mutable FKs must ship with the same pattern and matching assertions.
- Cross-user access checks are split by surface (see `supabase/tests/README.md` for how to run both and the findings list):
  - **Database RLS** is verified by SQL impersonation: `supabase/tests/rls_checks.sql` (transactional, self-rolling-back; 110 assertions) exercises the full isolation matrix — read/update/delete/insert, own and cross-user, plus reference-table immutability — between two users (PRD §55, §59). It depends on no state after its `ROLLBACK`; rollback and production-untouched are proved by the separate read-only `supabase/tests/rls_cleanup_check.sql`, which checks for the absence of every deterministic fixture identifier and mutated literal.
  - **Storage authorization** is verified through the real Storage API with real user JWTs: `supabase/tests/storage_rls_check.ts` (own-path round trip + cross-user denial matrix on the private `attachments` bucket, service-role key never used).
  - Direct `storage.objects` mutation is **intentionally not tested by SQL**: Supabase forbids direct DML on storage tables ("Direct deletion from storage tables is not allowed. Use the Storage API instead."), because Storage metadata and the underlying object store must stay synchronized. Storage schema metadata is treated as read-only from SQL, and all object mutations go through the Storage API — in tests and in the app alike.

## Logging

Never log: passwords, auth cookies, tokens, full provider sessions. Log instead: request id, provider, model, duration, status, error code (PRD §48). Analytics must not capture prompt content unless explicitly required (§49).

## Provider credentials — two modes, two custodians

**Workspace Models (server-held).** The provider credential is a server-only environment variable (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), read inside the route handler. It must never be given a `NEXT_PUBLIC_` prefix — that would ship it to every browser — and is never written to localStorage, Supabase, client state, logs, or error payloads. `apps/web/src/lib/providers/server/workspace.ts` is the only reader; a unit test asserts a `NEXT_PUBLIC_`-prefixed provider key is ignored. Only a boolean ("configured or not") ever crosses to the client.

**Bring Your Own API (user-held).** The user's own developer API key stays **only in their browser** (localStorage) and is sent as a per-request header to our same-origin proxy, which forwards it to the provider. No database column, no server-side persistence, no logging of the key or its presence. Disconnecting a connection clears the key from the browser. A BYOK request whose key is missing is refused rather than silently answered with the workspace credential — that would bill the wrong account.

**Both modes.** Proxy routes require a signed-in portal user (never an open relay), enforce per-user rate limits and payload caps, and map provider errors to normalized codes with generic messages — no key material, no prompt content, no upstream response bodies.

## Workspace usage control (owner-funded spend)

Workspace Models spend the app owner's budget, so requests are metered server-side and the counter is tamper-resistant by construction: `public.workspace_usage` has a SELECT-own RLS policy and **no** insert/update/delete policy, and is written only by `consume_workspace_quota()`, a `security definer` function with an empty `search_path` that derives the user from `auth.uid()` rather than trusting the client. Increment and limit check are one atomic upsert, so concurrent requests cannot race past the limit. No service-role key is involved. BYOK turns are not metered — they spend the user's own provider quota.

Model availability is policy in code (`lib/providers/model-map.ts`), not data: a model cannot become workspace-billable through a database edit, and an unrecognised model defaults to BYOK-only.

## Compliance policy (provider integrations)

Integration statuses: `supported | experimental | disabled | manual | official_api` (PRD §7). No adapter may steal cookies, request/store AI passwords, bypass rate/usage limits, defeat CAPTCHA, or circumvent provider protections — these are product non-goals (§5) and hard development rules (§61.13).

**Standing engineering position:** consumer subscriptions (ChatGPT Free/Plus/Pro, Claude consumer plans) and developer APIs are separate products. The consumer terms of OpenAI, Anthropic, Google, Microsoft and Perplexity prohibit automated/programmatic access to their consumer web interfaces, so this codebase contains **no** consumer-site automation, no session/credential capture, no scraping, and never draws on consumer subscription quota. A user's Unified AI Workspace sign-in authenticates them to this workspace only; it is not a provider login.

The supported integration modes both use the **official developer APIs**:

1. **Workspace Models** — the app owner's own API credential, held server-side and metered per user;
2. **Bring Your Own API** — the user's own API credential, held in their browser (optional path allowed by PRD §6);
3. a provider-sanctioned integration mechanism, if one becomes available.

The retired `manual` mode (user copy/paste) is no longer offered for new conversations; historical messages created under it remain readable.

Each adapter must pass a written ToS review before its status may be set to anything other than `disabled`. Mock adapters are used for all development.

## Browser extension (Milestone 5)

Implemented posture (`apps/extension`):

- Manifest V3 with **zero** `permissions` and `host_permissions`; content scripts run only on the explicit allowlist (claude.ai, chatgpt.com, the portal origins).
- Detection only: the provider content script announces tab presence. It never reads page content, cookies, or credentials, and never interacts with provider pages.
- The service worker validates every message sender (extension id, then origin against the provider/portal allowlist) and answers automation-type protocol messages (`SEND_PROMPT`, `STOP_GENERATION`, `GET_MODELS`) with `UNSUPPORTED_ACTION` — no automation exists to invoke.
- Portal ↔ extension messaging uses `window.postMessage` with origin and envelope validation on both ends; no credentials ever cross this channel.
- The extension is not permission to bypass provider restrictions (PRD §27).

## Release checklist (PRD §59) — last reviewed 2026-08-27 (release audit)

- [x] No external AI passwords stored — no password fields anywhere; API keys (optional, user-supplied) live in the user's browser only
- [x] RLS enabled on all user tables — see Database section; verified by `supabase/tests/rls_checks.sql`
- [x] Storage ownership policies enabled — `attachments` bucket, first path segment = `auth.uid()`; verified behaviourally end-to-end through the Storage API with two real user JWTs (`storage_rls_check.ts` → 9/9)
- [x] No sensitive tokens in logs — proxy routes never log keys or prompt content; client logs carry error digests only
- [x] Browser messaging validates origin — extension service worker + portal bridge validate sender id, origin allowlist and envelope shape on both ends
- [x] Extension permissions minimized — zero `permissions`/`host_permissions`; allowlisted content scripts only
- [x] Cross-user access tests fail — verified against hosted 2026-08-27: `rls_checks.sql` → `RLS_CHECKS_PASSED | 110 | 110`, `rls_cleanup_check.sql` → `CLEANUP_VERIFIED`, `storage_rls_check.ts` → 9/9
- [x] No provider restriction is bypassed — no consumer-site automation exists; `manual` + `official_api` modes only; extension answers automation messages with `UNSUPPORTED_ACTION`

**Recurring requirement:** after every migration push to a hosted project, re-run all three harnesses in order — `rls_checks.sql`, then `rls_cleanup_check.sql`, then `storage_rls_check.ts`. Last run 2026-08-27 against production: 110/110, CLEANUP_VERIFIED, 9/9.
