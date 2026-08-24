# Milestones — progress tracker

Source: [PRD.md §60](PRD.md). One milestone at a time (PRD rules 2, 18). Commits are focused per milestone (rule 19).

| # | Milestone | Status | Notes |
| --- | --- | --- | --- |
| 1 | Foundation | ✅ Done (2026-08-24) | Monorepo, Next.js, Tailwind v4, shadcn base, Supabase clients, env config, auth (Google + magic link), protected dashboard, profiles table + RLS |
| 2 | Core UI | ⬜ Next | App shell polish, chat header, provider/model/account selectors, composer, message list, theme switcher — mock providers |
| 3 | Database | ⬜ | Full schema (providers, models, accounts, projects, conversations, messages, attachments, sessions, devices, events), RLS, CRUD |
| 4 | Provider Core | ⬜ | `packages/provider-core`: adapter interface, registry, connection state, normalized errors, provider events, mock adapters |
| 5 | Browser Extension Foundation | ⬜ | `apps/extension`: MV3, service worker, secure messaging, allowlist, connection status only |
| 6 | First Provider Proof of Concept | ⬜ | **Compliance gate** — see below |
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

Acceptance criteria (PRD §55): sign-in/sign-out and route protection are implemented; final verification of the Google flow and RLS happens against the user's real Supabase project once env vars are set.

## Milestone 6 compliance gate

PRD §7 requires every adapter be reviewed against the provider's current terms **before** production release, and §5 forbids circumventing provider protections. As of 2026, the consumer terms of OpenAI, Anthropic, Google, Microsoft and Perplexity do not permit automated/programmatic access to their consumer web apps (chatgpt.com, claude.ai, etc.). Per PRD §7's own fallback clause, the compliant integration modes for Milestone 6 are therefore:

- `official_api` — optional per PRD §6 (user-provided keys), or
- `manual` — user-mediated flows with no automation of the provider site, or
- provider-sanctioned mechanisms if a provider introduces one.

Mock adapters (Milestone 4) power all development and UI work regardless of this decision. This gate must be resolved with the product owner before Milestone 6 implementation.
