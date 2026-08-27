# Architecture — current state

This document describes what is actually implemented. The target architecture lives in [PRD.md](PRD.md). Update this file whenever architecture changes (PRD rule 20).

## Monorepo

pnpm workspaces:

```text
apps/web                @uaw/web           — Next.js portal
apps/extension          @uaw/extension     — MV3 companion (tab-presence detection only; esbuild dev build)
packages/types          @uaw/types         — shared TypeScript types (TS source via transpilePackages)
packages/provider-core  @uaw/provider-core — adapter interface, registry, events, errors, HttpStreamAdapter, mock adapter
supabase/               migrations + seed (applied to the hosted Supabase project)
docs/                   product + engineering docs
```

Packages planned but intentionally not created yet (when first needed): `packages/ui`, `packages/config`, `packages/utils`.

## Browser extension (apps/extension)

```text
manifest.json                     → MV3, zero permissions, allowlisted content scripts
src/providers/registry.ts         → provider domain allowlist + portal origins
src/messaging/protocol.ts         → typed PRD §28 messages (+ postMessage envelopes)
src/background/service-worker.ts  → tab-presence map, sender validation, status answers
src/content/detect.ts             → passive provider-tab announcement (no page access)
src/content/portal-bridge.ts      → portal page ↔ service worker relay (origin-checked)
src/popup/                        → provider tab status popup
build.mjs                         → esbuild → dist/ (chrome://extensions, Load unpacked)
```

Web-side counterpart: `apps/web/src/lib/extension/client.ts` + the Settings card.

## Web app (apps/web)

Next.js App Router, TypeScript strict, Tailwind CSS v4 (CSS-first config in `src/app/globals.css` with shadcn-style design tokens, `.dark` class theme + no-flash inline script).

```text
src/app/
  page.tsx                    → redirects to /chat (middleware bounces unauthenticated → /login)
  (auth)/login/               → login page (Google + magic link) or setup notice if env missing
  auth/callback/route.ts      → OAuth/PKCE code exchange
  auth/confirm/route.ts       → magic-link token_hash fallback (verifyOtp)
  auth/signout/route.ts       → POST sign-out
  (dashboard)/layout.tsx      → server-side auth check + recents fetch + app shell (force-dynamic)
  (dashboard)/chat/           → new Master Conversation (?project= starts inside a project)
  (dashboard)/chat/[id]/      → stored conversation, reloaded from Supabase
  (dashboard)/projects/       → project CRUD (name, description, custom instructions)
  (dashboard)/settings/       → account, AI provider accounts, extension status, theme
src/components/
  ui/                         → shadcn-style primitives (button, input, label, card, popover)
  layout/app-shell.tsx        → client shell: sidebar + mobile drawer + collapse
  sidebar/sidebar.tsx         → nav, live recents (rename/archive/delete), profile, signout
  sidebar/search-dialog.tsx   → global search (titles, message contents, project names)
  auth/                       → login form, setup notice
  chat/                       → chat-view (state owner + persistence), composer, message-list,
                                message-content (code rendering)
  providers/                  → ai-selector, account-selector, provider-badge, catalog-context
  projects/project-manager.tsx→ project list + forms
  settings/theme-toggle.tsx   → light/dark/system switcher
  settings/provider-accounts.tsx → connect/remove Bring-Your-Own-API keys
  settings/extension-status.tsx  → companion extension connection status
src/hooks/use-theme.ts        → theme preference ↔ localStorage("uaw-theme") + .dark class
src/lib/
  env.ts                      → isSupabaseConfigured()
  db/database.types.ts        → hand-written typed schema for supabase-js
  db/queries.ts               → RSC reads (catalog data, recents, conversation+messages, projects)
  chat/actions.ts             → server actions: conversation/message CRUD, selection, events, search
  chat/types.ts               → UiChatMessage (chat UI state shape)
  projects/actions.ts         → server actions: project CRUD
  chat/context.ts             → context handoff engine: strategies A–D, rolling summary
  accounts/actions.ts         → server actions: connect/disconnect provider accounts (metadata only)
  extension/client.ts         → postMessage client for the companion extension
  providers/catalog.ts        → catalog built from DB rows (+ static fallback pre-migration)
  providers/registry.ts       → routing: Bring Your Own API only; everything else refused
  providers/model-map.ts      → catalog id → provider API model id (verified; DB is runtime source)
  providers/key-store.ts      → browser-only localStorage for user API keys (never server-side)
  providers/server/proxy.ts   → shared proxy plumbing (auth, rate limit, validation, model map)
  providers/server/claude.ts  → server half of the Claude official_api adapter (Anthropic SDK)
  supabase/client.ts          → createBrowserClient<Database>
  supabase/server.ts          → createServerClient<Database> over next/headers cookies (async)
  supabase/middleware.ts      → updateSession(): session refresh + route protection
src/middleware.ts             → invokes updateSession on all non-static routes
src/app/api/providers/claude/   → POST proxy route (Anthropic SDK streaming; validate action)
src/app/api/providers/chatgpt/  → POST proxy route (OpenAI SSE re-streamed; validate action)
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
| No provider automation code anywhere yet | Still true: providers are reached only through their official developer APIs with the user's own key, never by automating a consumer site |
| Provider/model/account data from `lib/providers/catalog.ts` | PRD §15 — never hard-coded in UI components; sourced from the database and resolved behind the registry |
| Chat state local to `ChatView` (React state, no Zustand yet) | PRD §46 — avoid unnecessary global state; persistence happens through server actions |
| Hand-rolled `Popover` primitive | PRD rule 3 — no Radix until a component genuinely needs it |
| Mock replies clearly labeled, simulated streaming | PRD §34 — never pretend a real provider is streaming; SECURITY.md mock policy |
| All user reads/writes via anon-key client + RLS | RLS is the access control; service role never used for user data paths |
| Reference seed data inside the migration | `db push` must seed hosted projects; `seed.sql` only runs on local resets |
| Messages persist on completion (user at send, assistant at finish/stop) | Mock streaming is client-side; a mid-stream navigation loses only the unfinished mock reply |
| Search = ILIKE over titles/contents/project names | PRD §38 initial scope; backed by `pg_trgm` GIN indexes since M9 (`20260825160000_search_indexes.sql`) |
| Hand-written `Database` type (type aliases, not interfaces) | supabase-js needs implicit index signatures; `supabase gen types` can replace it later |
| Adapter streaming = `onChunk` callback + AbortSignal | Matches PRD §25 promise shape while supporting §34 incremental output and §22 stop |
| Registry built client-side from the catalog | Chat runs in the browser; the registry routes BYOK requests and refuses every other case behind the same interface |
| Bring Your Own API is the only execution mode | The workspace funds no model usage; every request spends the key owner's quota |
| No connection → refuse, never simulate | A fabricated reply that reads as real is worse than a clear error; mock is behind an explicit dev flag |
| Retired `manual` rows filtered, not deleted | Historical messages must keep resolving their provider/model; no destructive migration |
| Assistant replies render fenced code only (no full Markdown) | Focused, dependency-free; code is what breaks layout when unrendered. Known gap: headings/lists/emphasis show as plain text |
| No connected account blocks sending rather than answering with mock text | Simulated replies are for genuine mock mode, not a silent production default |
| User API keys in browser localStorage only, proxied per request | PRD §19 — nothing credential-like server-side; provider-specific server logic lives only in the proxy route (adapter server-half) |
| Provider API model ids live in `models.capabilities.api_model`, mirrored in `model-map.ts` | Providers retire ids on their own schedule; a DB value can be refreshed by migration without a deploy, and the mirrored table keeps the app working pre-migration. A test parses the migration and fails on drift |
| Model id changes ship as new forward-only migrations | Rule 9/15 — committed migrations are never edited; old mappings are archived in `capabilities.deprecated_api_models`, never deleted |

## Deployment

Production: https://unified-ai-workspace-web.vercel.app (Vercel) + hosted Supabase.

Verified release state (2026-08-27):

- All 10 migrations applied to hosted Supabase (through `20260825210000`); 0 pending.
- `rls_checks.sql` → `RLS_CHECKS_PASSED | 110 | 110`; `rls_cleanup_check.sql` → `CLEANUP_VERIFIED`; `storage_rls_check.ts` → 9/9 via the Storage API.
- Verified in the production browser (2026-08-27, under the previous provider UX): Google sign-in, conversation create/persist/reload, recents, Claude → ChatGPT switching in one Master Conversation, provider/model labels on saved replies, context continuity. The Bring-Your-Own-API chat path has not yet been re-verified in the browser since the provider UX was narrowed.

## Environment

`apps/web/.env.local` (from `.env.example`):

```text
NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  public anon key (RLS enforces access)
SUPABASE_SERVICE_ROLE_KEY      server-only; deliberately unused by all app code paths; never expose to client
NEXT_PUBLIC_APP_URL            e.g. http://localhost:3000
```
