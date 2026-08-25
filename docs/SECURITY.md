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
- Cross-user access checks: `supabase/tests/rls_checks.sql` (transactional, self-rolling-back) exercises read/update/insert isolation between two users — run it against the target database after applying migrations (PRD §55, §59).

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

## Release checklist (PRD §59)

- [ ] No external AI passwords stored
- [ ] RLS enabled on all user tables
- [ ] Storage ownership policies enabled
- [ ] No sensitive tokens in logs
- [ ] Browser messaging validates origin
- [ ] Extension permissions minimized
- [ ] Cross-user access tests fail (unauthorized access impossible)
- [ ] No provider restriction is bypassed
