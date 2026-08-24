# Security

Binding rules from PRD §5, §7, §19, §32, §48, §59, §61–62. Violations block release.

## Credentials

- **Never** store external AI-provider passwords (Claude, ChatGPT, Google, Microsoft, Perplexity) — no database column, no log line, no form field that accepts them (PRD §19). The schema deliberately has no password field on `connected_accounts`.
- **Never** copy raw long-lived provider authentication cookies into Supabase or any backend store. Provider auth stays in the user's browser or a provider-supported mechanism.
- Portal auth is Supabase Auth only (Google OAuth, email magic link). Portal identity and provider identities are independent.
- Secrets only via environment variables. `.env*` is git-ignored; only `.env.example` (empty values) is committed. `SUPABASE_SERVICE_ROLE_KEY` must never appear in client bundles — no `NEXT_PUBLIC_` prefix, no import into client components.

## Database

- RLS enabled on every user-owned table **before the feature is considered done** (PRD rule 10). Current: `profiles` (select/insert/update restricted to `auth.uid() = id`).
- The signup trigger (`handle_new_user`) is `security definer` with an empty `search_path` to avoid search-path hijacking.
- Cross-user access must be covered by tests as tables are added (PRD §55, §59).

## Logging

Never log: passwords, auth cookies, tokens, full provider sessions. Log instead: request id, provider, model, duration, status, error code (PRD §48). Analytics must not capture prompt content unless explicitly required (§49).

## Compliance policy (provider integrations)

Integration statuses: `supported | experimental | disabled | manual | official_api` (PRD §7). No adapter may steal cookies, request/store AI passwords, bypass rate/usage limits, defeat CAPTCHA, or circumvent provider protections — these are product non-goals (§5) and hard development rules (§61.13).

**Standing engineering position:** the consumer terms of service of OpenAI, Anthropic, Google, Microsoft and Perplexity currently prohibit automated/programmatic access to their consumer web interfaces. PRD §7 explicitly requires falling back to a compliant mode in that case. Therefore this codebase contains no consumer-site automation, and the viable integration modes for real providers are:

1. `official_api` — user-supplied API keys via the official APIs (optional path allowed by PRD §6);
2. `manual` — user-mediated flows with zero automation of the provider site;
3. a provider-sanctioned integration mechanism, if one becomes available.

Each adapter must pass a written ToS review before its status may be set to anything other than `disabled`. Mock adapters are used for all development.

## Browser extension (Milestone 5+)

Minimum host permissions, explicit domain allowlist, origin-validated messaging, credentials never exposed to the web app (PRD §29). The extension is not permission to bypass provider restrictions (§27).

## Release checklist (PRD §59)

- [ ] No external AI passwords stored
- [ ] RLS enabled on all user tables
- [ ] Storage ownership policies enabled
- [ ] No sensitive tokens in logs
- [ ] Browser messaging validates origin
- [ ] Extension permissions minimized
- [ ] Cross-user access tests fail (unauthorized access impossible)
- [ ] No provider restriction is bypassed
