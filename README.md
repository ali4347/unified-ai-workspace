# Unified AI Workspace

One persistent workspace above individual AI providers, organized around **Projects → Conversations → Messages**.

> **Start with one AI. Switch to another. Keep the same work.**

The primary object is a **Master Conversation** that belongs to this application; different AI providers (Claude, ChatGPT, and later Gemini, Perplexity, Copilot) participate in that conversation.

Full product specification: [docs/PRD.md](docs/PRD.md)

## Status

Milestone 1 (Foundation) is implemented. See [docs/MILESTONES.md](docs/MILESTONES.md) for the full roadmap and current progress.

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
    web/                 Next.js portal (auth + dashboard shell)
  packages/
    types/               @uaw/types — shared provider/domain types
  supabase/
    migrations/          SQL migrations (RLS enabled)
    seed.sql             provider/model seed (Milestone 3)
  docs/
    PRD.md               product requirements (source of truth)
    ARCHITECTURE.md      implemented architecture + decisions
    PROVIDER_ADAPTERS.md adapter interface, registry, compliance
    SECURITY.md          credential, RLS and compliance rules
    MILESTONES.md        roadmap + progress tracker
```

`apps/extension`, `packages/provider-core`, `packages/ui` etc. are added in their own milestones (PRD rule 18: no premature implementation).

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
2. Open **SQL Editor** in the Supabase dashboard and run the contents of `supabase/migrations/20260824120000_profiles.sql`.
   (Alternatively, with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
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
pnpm build      # production build
pnpm typecheck  # tsc --noEmit across the workspace
pnpm lint       # eslint across the workspace
```

## Compliance position (important)

This product **never** stores external AI passwords, never copies provider auth cookies to the backend, and never bypasses provider rate limits, CAPTCHAs, or anti-automation protections (PRD §5, §7, §19). Every provider adapter carries an integration status (`supported | experimental | disabled | manual | official_api`) and must pass a terms-of-service review before it is enabled. Where a provider does not permit programmatic use of its consumer web interface — which is currently the case for all major providers — the compliant modes are `official_api` (optional per PRD §6) or `manual`. See [docs/SECURITY.md](docs/SECURITY.md) and [docs/PROVIDER_ADAPTERS.md](docs/PROVIDER_ADAPTERS.md).
