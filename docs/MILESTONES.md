# Milestones — progress tracker

Source: [PRD.md §60](PRD.md). One milestone at a time (PRD rules 2, 18). Commits are focused per milestone (rule 19).

| # | Milestone | Status | Notes |
| --- | --- | --- | --- |
| 1 | Foundation | ✅ Done (2026-08-24) | Monorepo, Next.js, Tailwind v4, shadcn base, Supabase clients, env config, auth (Google + magic link), protected dashboard, profiles table + RLS. Verified in production 2026-08-25 (Google OAuth + Supabase live at https://unified-ai-workspace-web.vercel.app) |
| 2 | Core UI | ✅ Done (2026-08-25) | App shell polish, chat header, provider/model/account selectors, composer, message list with provider badges + switch dividers, theme switcher — all on mock providers |
| 3 | Database | ✅ Done (2026-08-25) | Full schema migration + RLS + seeds + storage policies; conversation/message persistence; recents, rename/archive/delete, search; project CRUD |
| 4 | Provider Core | ✅ Done (2026-08-25) | `packages/provider-core`: adapter interface, registry, event bus, normalized errors, mock adapter; chat wired through the registry |
| 5 | Browser Extension Foundation | ✅ Done (2026-08-25) | `apps/extension`: MV3, service worker, origin-validated messaging, allowlist, tab-presence detection only; portal status card |
| 6 | First Provider Proof of Concept | ⬜ Next | **Compliance gate resolved** — see below |
| 7 | Second Provider | ⬜ | Provider A → Master Conversation → Provider B |
| 8 | Context Handoff | ⬜ | Strategies A–D, rolling summaries, switch events |
| 9 | Production Hardening | ⬜ | Monitoring, retries, security review, indexes |
| 10 | Deployment | ⬜ | Vercel + Supabase + GitHub |

## Milestone 1 — delivered scope

- pnpm workspace monorepo (`apps/web`, `packages/types`)
- Next.js App Router + TypeScript strict + Tailwind CSS v4 + shadcn conventions
- Supabase browser/server/middleware clients (`@supabase/ssr`)
- Environment configuration with graceful "not configured yet" setup notice
- Auth: Google OAuth + email magic link, `/auth/callback` (PKCE code exchange), `/auth/confirm` (token-hash fallback), `/auth/signout`
- Route protection via middleware + server-side checks in the dashboard layout
- Protected dashboard shell: sidebar (New Chat, Search, Projects, Recent, Settings, profile, collapse + mobile drawer), `/chat`, `/projects`, `/settings` placeholders
- `supabase/migrations/20260824120000_profiles.sql`: profiles table, RLS policies, auto-create trigger on signup
- Docs: PRD, ARCHITECTURE, SECURITY, PROVIDER_ADAPTERS, MILESTONES

Acceptance criteria (PRD §55): sign-in/sign-out and route protection are implemented; the Google flow and Supabase connection were verified on the production deployment (2026-08-25).

## Milestone 2 — delivered scope

- Chat header with the top AI selector (models grouped by provider from the mock catalog, PRD §15) and per-provider account selector (PRD §16) — Phase 2 providers visible but unselectable
- Mock provider catalog + mock chat engine in `apps/web/src/lib/providers/` (no provider logic in UI components); clearly labeled mock replies with simulated streaming, replaced by the adapter registry at Milestone 4
- Master Conversation message list: user/assistant turns, provider badge per assistant message (PRD §24), "provider changed" dividers (PRD §3), copy, stop generation, message statuses (PRD §22–23)
- Composer: multiline, Enter/Shift+Enter, auto-grow, stop button; attachments stay disabled until Milestone 3
- Theme switcher light/dark/system in Settings (PRD §37, §40), persisted to `localStorage("uaw-theme")` in sync with the no-flash script
- App shell polish: empty desktop header strip removed when the sidebar is expanded
- Shared types: `ModelInfo`, `ProviderAccountInfo`, `ProviderSelection` in `@uaw/types`
- Not included by design: persistence (M3), real adapters/registry (M4), search (M3)

## Milestone 3 — delivered scope

- `supabase/migrations/20260825090000_core_schema.sql`: all PRD §31 tables (providers, models, connected_accounts, projects, conversations, messages, attachments, provider_sessions, extension_devices, provider_events) with RLS owner policies on every user table, reference-table read policies, updated_at triggers, indexes, idempotent provider/model seeds, private `attachments` storage bucket + ownership policies
- `supabase/tests/rls_checks.sql`: transactional cross-user isolation checks (PRD §55, §59) — run against the target DB, rolls back
- Chat persistence: conversation auto-created on first message, messages saved with provider/model/account ids, per-conversation active selection stored, `/chat/[id]` reloads full history
- Sidebar: live recents (ordered by activity), rename / archive / delete, global search dialog (titles + message contents + project names, ILIKE)
- Projects: CRUD with custom instructions (PRD §20–21), "New chat in project"
- Provider/model catalog now database-built (fallback static catalog keeps the app usable pre-migration); accounts come from `connected_accounts` (none until M6)
- Hand-written typed `Database` schema for supabase-js
- **Note:** the migration must be applied to the hosted Supabase project (`supabase db push` or SQL Editor) — scheduled with the final deployment step (M10)

## Milestone 4 — delivered scope

- `packages/provider-core` (`@uaw/provider-core`, TS source via transpilePackages): `AIProviderAdapter` interface (PRD §25) with AbortSignal cancellation + `onChunk` streaming, `ProviderRegistry` (PRD §26, lazy adapter factories), `ProviderAdapterError` + `providerError()` normalized errors (PRD §47), `ProviderEventBus`
- `MockAdapter`: clearly-labeled simulated replies/streaming (PRD §34); the only adapter — no website-specific automation anywhere (M4 requirement)
- Web: `lib/providers/registry.ts` builds the registry from the catalog; ChatView sends through `adapter.sendMessage` (stop = abort), `failed` message state, provider events (`provider_switched`, `model_changed`, `request_failed`) persist to `provider_events` via the event bus
- Integration status stays `disabled` for every real provider pending the M6 gate

## Milestone 5 — delivered scope

- `apps/extension` (`@uaw/extension`): Manifest V3, zero `permissions`/`host_permissions`, esbuild dev build (`pnpm --filter @uaw/extension build` → `dist/`, load unpacked)
- Content-script registry + explicit domain allowlist (claude.ai, chatgpt.com — MVP only, PRD §29)
- `detect.ts`: passive tab-presence detection only — never reads page content, cookies or credentials, never interacts with provider pages
- Service worker: tracks provider tabs, validates every sender (extension id + origin allowlist), answers `GET_STATUS`/`CHECK_PROVIDER`; automation-type protocol messages (`SEND_PROMPT`, `STOP_GENERATION`, `GET_MODELS`) are answered with `UNSUPPORTED_ACTION` by design
- Portal bridge content script ↔ web app via `window.postMessage` with origin + envelope validation on both sides (PRD §28)
- Web: Settings → Browser extension card shows connection + provider tab status
- Popup lists open provider tabs

## Milestone 6 compliance gate

PRD §7 requires every adapter be reviewed against the provider's current terms **before** production release, and §5 forbids circumventing provider protections. As of 2026, the consumer terms of OpenAI, Anthropic, Google, Microsoft and Perplexity do not permit automated/programmatic access to their consumer web apps (chatgpt.com, claude.ai, etc.). Per PRD §7's own fallback clause, the compliant integration modes for Milestone 6 are therefore:

- `official_api` — optional per PRD §6 (user-provided keys), or
- `manual` — user-mediated flows with no automation of the provider site, or
- provider-sanctioned mechanisms if a provider introduces one.

Mock adapters (Milestone 4) power all development and UI work regardless of this decision. This gate must be resolved with the product owner before Milestone 6 implementation.
