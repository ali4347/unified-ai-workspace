# Architecture — current state

This document describes what is actually implemented. The target architecture lives in [PRD.md](PRD.md). Update this file whenever architecture changes (PRD rule 20).

## Monorepo

pnpm workspaces:

```text
apps/web            @uaw/web    — Next.js portal
packages/types      @uaw/types  — shared TypeScript types (consumed as source via transpilePackages)
supabase/           migrations + seed (applied to the hosted Supabase project)
docs/               product + engineering docs
```

Packages planned but intentionally not created yet (their milestones): `apps/extension` (M5), `packages/provider-core` (M4), `packages/ui`, `packages/config`, `packages/utils` (when first needed).

## Web app (apps/web)

Next.js App Router, TypeScript strict, Tailwind CSS v4 (CSS-first config in `src/app/globals.css` with shadcn-style design tokens, `.dark` class theme + no-flash inline script).

```text
src/app/
  page.tsx                    → redirects to /chat (middleware bounces unauthenticated → /login)
  (auth)/login/               → login page (Google + magic link) or setup notice if env missing
  auth/callback/route.ts      → OAuth/PKCE code exchange
  auth/confirm/route.ts       → magic-link token_hash fallback (verifyOtp)
  auth/signout/route.ts       → POST sign-out
  (dashboard)/layout.tsx      → server-side auth check + app shell (force-dynamic)
  (dashboard)/chat/           → chat empty state + placeholder composer
  (dashboard)/projects/       → placeholder (M3)
  (dashboard)/settings/       → placeholder (account info)
src/components/
  ui/                         → shadcn-style primitives (button, input, label, card)
  layout/app-shell.tsx        → client shell: sidebar + mobile drawer + collapse
  sidebar/sidebar.tsx         → sidebar content (nav, recents placeholder, profile, signout)
  auth/                       → login form, setup notice
src/lib/
  env.ts                      → isSupabaseConfigured()
  supabase/client.ts          → createBrowserClient
  supabase/server.ts          → createServerClient over next/headers cookies (async)
  supabase/middleware.ts      → updateSession(): session refresh + route protection
src/middleware.ts             → invokes updateSession on all non-static routes
```

## Auth flow

```text
Request
  → middleware (updateSession)
      - refreshes Supabase session cookies (getAll/setAll pattern)
      - no user + protected path  → redirect /login
      - user + /login             → redirect /chat
  → (dashboard)/layout re-verifies user server-side (defense in depth)

Login page
  - Google → supabase.auth.signInWithOAuth → provider → /auth/callback?code= → exchangeCodeForSession → /chat
  - Magic link → signInWithOtp(emailRedirectTo=/auth/callback)
      → same-browser PKCE: /auth/callback?code=
      → cross-browser/custom template: /auth/confirm?token_hash=&type=email → verifyOtp
```

## Decisions log

| Decision | Rationale |
| --- | --- |
| Master Conversation as app-owned object | PRD §3 — providers are participants, not owners |
| pnpm workspaces, no Turborepo yet | PRD §42 — add only if build orchestration hurts |
| Tailwind v4 CSS-first, no `tailwind.config` | Current Tailwind major; shadcn v4 conventions |
| Hand-rolled UI primitives, no Radix yet | PRD rule 3 (no unnecessary dependencies); `components.json` kept so the shadcn CLI can add components later |
| Dependency versions as x-ranges (`15.x`) | Resolve latest patch/minor within a vetted major |
| `force-dynamic` on auth-dependent segments | Nothing auth/env-related may be baked into the static build |
| Missing env → setup notice, not crash | Developer/deployment ergonomics; PRD §62 |
| `@uaw/types` consumed as TS source | No build step; `transpilePackages` in next.config |
| No provider automation code anywhere yet | M4 uses mocks; M6 integration mode is gated on compliance review (see MILESTONES.md) |

## Environment

`apps/web/.env.local` (from `.env.example`):

```text
NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  public anon key (RLS enforces access)
SUPABASE_SERVICE_ROLE_KEY      server-only; unused in M1; never expose to client
NEXT_PUBLIC_APP_URL            e.g. http://localhost:3000
```
