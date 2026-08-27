# Unified AI Workspace

One persistent workspace above individual AI providers, organized around **Projects → Conversations → Messages**.

> **Start with one AI. Switch to another. Keep the same work.**

The primary object is a **Master Conversation** that belongs to this application; different AI providers (Claude, ChatGPT, and later Gemini, Perplexity, Copilot) participate in that conversation.

Full product specification: [docs/PRD.md](docs/PRD.md)

## Status

Milestones 1–10 are implemented — foundation, core UI, database + RLS, provider core, extension foundation, Claude + ChatGPT integrations (compliant `manual` + optional `official_api` modes), context handoff, hardening and deployment. See [docs/MILESTONES.md](docs/MILESTONES.md) for per-milestone scope.

Production: https://unified-ai-workspace-web.vercel.app

**Verified release state (2026-08-27)**

| Check | Result |
| --- | --- |
| Hosted migrations | all 10 applied, 0 pending |
| Database RLS suite | `RLS_CHECKS_PASSED` — 110 / 110 assertions |
| Rollback / cleanup proof | `CLEANUP_VERIFIED` |
| Storage authorization (Storage API) | 9/9 |
| Production browser flows | Google sign-in, conversation create/persist/reload, recents, Claude + ChatGPT manual connection and handoff, Claude → ChatGPT switching in one conversation |

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (App Router), TypeScript strict, React, Tailwind CSS v4, shadcn/ui conventions, Lucide icons |
| Backend | Supabase (Auth, PostgreSQL, Storage) |
| Hosting | Vercel |
| Companion (later) | Chrome Extension, Manifest V3 |
| Tooling | pnpm workspaces, Claude Code, Git/GitHub |

## Repository layout

```text
unified-ai-workspace/
  apps/
    web/                 Next.js portal (chat, projects, settings, provider proxies)
    extension/           MV3 companion — tab-presence detection only, zero permissions
  packages/
    types/               @uaw/types — shared provider/domain types
    provider-core/       @uaw/provider-core — adapter interface, registry, events, adapters
  supabase/
    migrations/          SQL migrations (schema, RLS, seeds, indexes)
    tests/               rls_checks.sql (110 database RLS assertions),
                         rls_cleanup_check.sql (rollback proof),
                         storage_rls_check.ts (Storage API, 9 assertions)
  docs/
    PRD.md               product requirements (source of truth)
    ARCHITECTURE.md      implemented architecture + decisions
    PROVIDER_ADAPTERS.md adapter interface, registry, compliance records
    SECURITY.md          credential, RLS and compliance rules
    MILESTONES.md        roadmap + progress tracker
```

## Getting started

### 1. Prerequisites

- Node.js 20+
- pnpm 9+
- A [Supabase](https://supabase.com) project (free tier is fine)

### 2. Install

```bash
pnpm install
```

### 3. Set up Supabase

1. Create a project at [database.new](https://database.new).
2. Apply **all** files in `supabase/migrations/` in filename order — either paste each into the **SQL Editor**, or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`. Afterwards verify isolation: run `supabase/tests/rls_checks.sql` (it rolls itself back), then `supabase/tests/rls_cleanup_check.sql`, then `supabase/tests/storage_rls_check.ts` for storage authorization — see `supabase/tests/README.md`.
3. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`
4. **Authentication → Sign In / Up**:
   - Email (magic link) is enabled by default.
   - Enable **Google**: create OAuth credentials in Google Cloud Console, paste client ID/secret into Supabase, and add the callback URL Supabase shows you to the Google OAuth client.

### 4. Environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from **Project Settings → API** in the Supabase dashboard. The service role key stays server-side only and is not needed yet.

If the app starts without these variables it shows a setup notice instead of crashing.

### 5. Run

```bash
pnpm dev        # http://localhost:3000
pnpm build      # production build (web)
pnpm typecheck  # tsc --noEmit across the workspace
pnpm lint       # eslint across the workspace
pnpm test       # vitest unit tests
pnpm --filter @uaw/extension build   # extension dev build → apps/extension/dist
```

## Using real providers

Without a connected account, chat replies are clearly-labeled **mocks**. In **Settings → AI providers** you can connect Claude or ChatGPT in two compliant modes:

- **Manual** — zero credentials: the app builds a context package, you paste it into the provider's own site and paste the reply back. The reply is stored in the Master Conversation with a "manual" badge.
- **Your API key** — automatic streamed replies via the official Anthropic/OpenAI APIs. The key is validated and then stored **only in your browser** (localStorage); each request forwards it through a same-origin proxy that never stores or logs it.

Switching provider mid-conversation hands off context automatically (full history while it fits, otherwise rolling summary + recent messages).

## Deployment

- **Web** — Vercel, auto-deploys from `main`. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`.
- **Database** — hosted Supabase; apply `supabase/migrations/` (SQL Editor or `supabase db push`) and re-run all three harnesses in `supabase/tests/` after schema changes.
- **Extension** — development build only: `pnpm --filter @uaw/extension build`, then load `apps/extension/dist` unpacked via chrome://extensions.

## Compliance position (important)

This product **never** stores external AI passwords, never copies provider auth cookies to the backend, and never bypasses provider rate limits, CAPTCHAs, or anti-automation protections (PRD §5, §7, §19). Every provider adapter carries an integration status (`supported | experimental | disabled | manual | official_api`) and must pass a terms-of-service review before it is enabled. Where a provider does not permit programmatic use of its consumer web interface — which is currently the case for all major providers — the compliant modes are `official_api` (optional per PRD §6) or `manual`. See [docs/SECURITY.md](docs/SECURITY.md) and [docs/PROVIDER_ADAPTERS.md](docs/PROVIDER_ADAPTERS.md).
