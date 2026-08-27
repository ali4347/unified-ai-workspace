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

## User-supplied API keys (`official_api` mode, M6+)

- Keys are stored **only in the user's browser** (localStorage) and sent as a per-request header to our same-origin proxy route, which forwards them to the official provider API. No database column, no server-side persistence, no logging of the key or its presence.
- Proxy routes require a signed-in portal user (never an open relay), enforce per-user rate limits and payload caps, and map provider errors to normalized codes with generic messages (no key material, no prompt content).
- Disconnecting an API-key account clears the key from the browser.

## Compliance policy (provider integrations)

Integration statuses: `supported | experimental | disabled | manual | official_api` (PRD §7). No adapter may steal cookies, request/store AI passwords, bypass rate/usage limits, defeat CAPTCHA, or circumvent provider protections — these are product non-goals (§5) and hard development rules (§61.13).

**Standing engineering position:** the consumer terms of service of OpenAI, Anthropic, Google, Microsoft and Perplexity currently prohibit automated/programmatic access to their consumer web interfaces. PRD §7 explicitly requires falling back to a compliant mode in that case. Therefore this codebase contains no consumer-site automation, and the viable integration modes for real providers are:

1. `official_api` — user-supplied API keys via the official APIs (optional path allowed by PRD §6);
2. `manual` — user-mediated flows with zero automation of the provider site;
3. a provider-sanctioned integration mechanism, if one becomes available.

Each adapter must pass a written ToS review before its status may be set to anything other than `disabled`. Mock adapters are used for all development.

## Browser extension (Milestone 5)

Implemented posture (`apps/extension`):

- Manifest V3 with **zero** `permissions` and `host_permissions`; content scripts run only on the explicit allowlist (claude.ai, chatgpt.com, the portal origins).
- Detection only: the provider content script announces tab presence. It never reads page content, cookies, or credentials, and never interacts with provider pages.
- The service worker validates every message sender (extension id, then origin against the provider/portal allowlist) and answers automation-type protocol messages (`SEND_PROMPT`, `STOP_GENERATION`, `GET_MODELS`) with `UNSUPPORTED_ACTION` — no automation exists to invoke.
- Portal ↔ extension messaging uses `window.postMessage` with origin and envelope validation on both ends; no credentials ever cross this channel.
- The extension is not permission to bypass provider restrictions (PRD §27).

## Release checklist (PRD §59) — reviewed at M9 (2026-08-25)

- [x] No external AI passwords stored — no password fields anywhere; API keys (optional, user-supplied) live in the user's browser only
- [x] RLS enabled on all user tables — see Database section; verified by `supabase/tests/rls_checks.sql`
- [x] Storage ownership policies enabled — `attachments` bucket, first path segment = `auth.uid()`
- [x] No sensitive tokens in logs — proxy routes never log keys or prompt content; client logs carry error digests only
- [x] Browser messaging validates origin — extension service worker + portal bridge validate sender id, origin allowlist and envelope shape on both ends
- [x] Extension permissions minimized — zero `permissions`/`host_permissions`; allowlisted content scripts only
- [x] Cross-user access tests fail — `rls_checks.sql` (run against the hosted DB after each migration push)
- [x] No provider restriction is bypassed — no consumer-site automation exists; `manual` + `official_api` modes only; extension answers automation messages with `UNSUPPORTED_ACTION`

Remaining operational step: run `rls_checks.sql` against the hosted project whenever migrations are pushed (M10 deployment step).
