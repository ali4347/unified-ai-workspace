# Unified AI Workspace — Claude Code guide

Multi-provider AI portal. The primary object is a **Master Conversation** owned by this app; providers (Claude, ChatGPT, later Gemini/Perplexity/Copilot) participate in it.

**Read `docs/PRD.md` before changing architecture** (PRD rule 1). Track progress in `docs/MILESTONES.md` — implement one milestone at a time, never future milestones prematurely (rules 2, 18).

## Commands

```bash
pnpm dev          # run web app (apps/web) on :3000
pnpm build        # production build (web)
pnpm typecheck    # tsc --noEmit, all workspace packages
pnpm lint         # eslint, all workspace packages
pnpm test         # vitest unit tests (context handoff, catalog, proxy validation)
pnpm --filter @uaw/extension build   # MV3 companion → apps/extension/dist
```

## Layout

- `apps/web` — Next.js App Router portal. Route groups: `(auth)` for login, `(dashboard)` for the protected shell (`/chat`, `/projects`, `/settings`). Auth route handlers live at `src/app/auth/{callback,confirm,signout}`.
- `apps/web/src/lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/route handlers), `middleware.ts` (session refresh + route protection, invoked from `src/middleware.ts`).
- `packages/types` — `@uaw/types`, shared provider/domain types. Consumed as TS source via `transpilePackages`.
- `supabase/migrations` — SQL with RLS. Schema changes go through migrations only (rule 9), never silent architecture changes (rule 15).
- `docs/` — PRD, architecture, security, provider-adapter and milestone docs. Update docs when architecture changes (rule 20).

## Hard rules (from PRD §61)

- TypeScript strict; no `any` without justification.
- Provider logic stays out of UI components; adapters stay isolated behind the common interface (`docs/PROVIDER_ADAPTERS.md`).
- Never store AI-provider passwords or raw provider cookies; never log tokens/cookies (PRD §19, §48).
- Never implement authentication bypasses, rate-limit/CAPTCHA circumvention, or anti-automation defeats — regardless of milestone. Compliant integration modes only (`official_api`, `manual`, mock). See `docs/SECURITY.md`.
- RLS enabled before a data feature counts as done. Secrets only via env; never commit `.env`; service role key never reaches the client bundle.
- After implementation run `pnpm typecheck && pnpm lint` (rule 16). Definition of Done is PRD §63.
- Commits stay focused per milestone (rule 19).

## Conventions

- Tailwind CSS v4 (CSS-first config in `src/app/globals.css`, shadcn-style tokens, `.dark` class theme).
- shadcn/ui conventions: components in `src/components/ui`, `cn()` in `src/lib/utils.ts`, `components.json` present for the shadcn CLI. Minimal hand-rolled primitives so far (no Radix deps yet — add only when a component needs one).
- Package versions use x-ranges (`15.x`) — resolve latest within a vetted major.
- Auth-dependent pages/layouts declare `export const dynamic = "force-dynamic"` so nothing auth-related is baked at build time.
- Missing Supabase env must degrade to the setup notice, never a crash (`src/lib/env.ts`).
