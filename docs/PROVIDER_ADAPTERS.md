# Provider adapters

Adapters are the only place provider-specific logic may live (PRD rules 6, 12). The rest of the app talks to the common interface and the registry, both implemented in `packages/provider-core`. Streaming uses an `onChunk` callback; cancellation uses `AbortSignal`.

## Execution mode

Production has exactly one: **Bring Your Own API**. The user's own OpenAI/Anthropic developer key is held in their browser and forwarded per request to the same-origin proxy route, which holds all provider-specific server logic. Usage is billed to the key owner; the workspace holds no provider credentials.

`apps/web/src/lib/providers/registry.ts` refuses everything else rather than approximating it:

| Situation | Result |
| --- | --- |
| BYOK connection selected, key present | streamed reply |
| BYOK connection selected, key missing from this browser | `LOGIN_REQUIRED` — fails loudly, never falls through to another path |
| No connection selected | `UNSUPPORTED_ACTION` — sending is blocked in the UI with a link to Settings |
| Retired `manual` record selected | `UNSUPPORTED_ACTION` |
| Mock adapter | dev/test only, behind `NEXT_PUBLIC_UAW_ENABLE_MOCK_PROVIDERS` |

`manual` mode is **retired**: not offered, not selectable, not executable. Its `connected_accounts` rows and messages remain readable and are excluded from selection rather than deleted — no destructive migration. Consumer ChatGPT/Claude subscriptions are never used.

## Common interface (PRD §25)

```typescript
interface AIProviderAdapter {
  connect(): Promise<void>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  getModels(): Promise<Model[]>;
  createConversation?(): Promise<string>;
  sendMessage(request: ProviderMessageRequest): Promise<ProviderResponse>;
  stopGeneration?(): Promise<void>;
  detectUsageLimit?(): Promise<UsageState>;
}
```

Shared types (`ProviderSlug`, `ProviderConnectionState`, `IntegrationStatus`, `ProviderError`, error codes) live in `@uaw/types` and are the single source of truth.

## Registry (PRD §26)

The registry maps slug → `{ enabled, integrationStatus, adapter }`. UI reads the registry; enabling/disabling a provider never touches chat components. Models come from provider configuration, never hard-coded in UI (PRD §15).

## Integration status (PRD §7)

| Status | Meaning |
| --- | --- |
| `supported` | Reviewed, compliant, production-ready |
| `experimental` | Compliant mechanism under validation; off by default |
| `disabled` | Not available (default for every new adapter) |
| `manual` | User performs the provider interaction; app organizes/persists the workflow |
| `official_api` | Official provider API with user-supplied credentials (optional path, PRD §6) |

## Compliance checklist — required before any adapter leaves `disabled`

1. Written review of the provider's current terms of service, dated and linked.
2. Confirmation the mechanism does not: automate the consumer web UI against its terms, touch auth cookies, request/store passwords, bypass limits/CAPTCHA/anti-automation (PRD §5, §7).
3. Failure modes mapped to normalized error codes (`LOGIN_REQUIRED`, `SESSION_EXPIRED`, `MODEL_UNAVAILABLE`, `USAGE_LIMIT`, `PROVIDER_CHANGED`, `NETWORK_ERROR`, `UNSUPPORTED_ACTION`).
4. Usage-limit handling = surface + offer switch, never bypass (PRD §35).
5. Product-owner sign-off recorded in this file.

## Current adapter status

| Provider | Status | Notes |
| --- | --- | --- |
| Claude (Anthropic API) | `official_api` — BYOK | User's own Anthropic developer key via `/api/providers/claude` |
| ChatGPT (OpenAI API) | `official_api` — BYOK | User's own OpenAI developer key via `/api/providers/chatgpt` |
| Mock | dev/test only | Behind `NEXT_PUBLIC_UAW_ENABLE_MOCK_PROVIDERS`; unreachable in production |
| Gemini | `disabled` | Phase 2 | — |
| Perplexity | `disabled` | Phase 2 | — |
| Copilot | `disabled` | Phase 2 | — |

## Milestone 6 compliance record — Claude (2026-08-25)

1. **ToS review:** Anthropic's consumer terms (claude.ai) prohibit automated/programmatic access to the consumer web app; the Anthropic **API** terms permit programmatic use with the account holder's own API key. Conclusion unchanged from the standing engineering position in `docs/SECURITY.md`.
2. **Mechanism check:** `manual` mode automates nothing — the app builds a context package, the user performs the provider interaction in their own session and pastes the reply back. `official_api` mode calls the official Anthropic API through a server proxy with the user's own key, which is held in the user's browser (localStorage) and forwarded per request only — never stored, logged or persisted server-side. No cookies touched, no passwords requested/stored, no limits/CAPTCHA/anti-automation circumvented.
3. **Failure modes** mapped to normalized codes in the proxy (`LOGIN_REQUIRED` for invalid/missing key, `MODEL_UNAVAILABLE`, `USAGE_LIMIT` for provider rate limits, `NETWORK_ERROR`) and surfaced by `HttpStreamAdapter`.
4. **Usage limits:** surfaced as `USAGE_LIMIT` + the user can switch providers; never bypassed (PRD §35).
5. **Product-owner sign-off:** recorded 2026-08-25 — mode decision "Manual + Official API" approved by the product owner (session decision, AskUserQuestion).

**Updated 2026-08-27:** `manual` is retired and Bring Your Own API is the only production mode. The compliance conclusions above are unchanged — official developer APIs only, no consumer-site automation, no consumer quota — and no owner-funded credential exists.

Implementation notes: client half = `HttpStreamAdapter` (provider-core, generic); server half = `apps/web/src/app/api/providers/claude` + `lib/providers/server/claude.ts` (the only place Claude-specific logic lives). Requests for models that support it (`claude-opus-5`, `claude-fable-5`) enable Anthropic's server-side refusal fallbacks (`fallbacks: "default"`) so a safety decline reroutes to a fallback model instead of dead-ending.

## Provider API model ids

Catalog model ids (`chatgpt-flagship`, `claude-sonnet`, …) are stable app-level keys. The provider-side id they resolve to lives in `models.capabilities.api_model`, with the same table mirrored in `apps/web/src/lib/providers/model-map.ts` as a pre-migration fallback. `model-map.test.ts` fails the build if the two drift apart or if a retired id reappears.

**Canonical ids are pinned snapshots.** Where a provider documents both a snapshot id and a convenience alias, the snapshot is what we persist and send — an alias can be repointed at a new model underneath us, which would silently change behaviour and cost. Aliases are recorded separately (`capabilities.api_model_alias`, `API_MODEL_ALIASES`) and are accepted on input for compatibility: `canonicalApiModel()` normalizes any alias found in a database row to the pinned id before the request goes out.

**Last verified against official documentation: 2026-08-27.**

| Catalog id | Canonical API model id | Alias (not persisted) | Source |
| --- | --- | --- | --- |
| `claude-sonnet` | `claude-sonnet-5` | — | [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview) |
| `claude-opus` | `claude-opus-5` | — | same |
| `claude-fable` | `claude-fable-5` | — | same |
| `claude-haiku` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | same |
| `chatgpt-flagship` | `gpt-5.6-sol` | `gpt-5.6` | [OpenAI models](https://developers.openai.com/api/docs/models) |
| `chatgpt-balanced` | `gpt-5.6-terra` | — | same |
| `chatgpt-mini` | `gpt-5.6-luna` | — | same |

The Claude ids above are the documented "Claude API ID" column; the dateless Claude 5-generation ids (`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`) are themselves pinned snapshots, so only Haiku 4.5 carries a separate dated form. Every OpenAI id lists `/v1/chat/completions` as supported, which is the endpoint our proxy uses; that endpoint is not deprecated (verified 2026-08-27).

### Re-audit triggers

- **2026-10-15** — Anthropic's earliest retirement commitment for Claude Haiku 4.5. Re-audit before then and map `claude-haiku` to its successor if one has shipped.
- OpenAI retired the GPT-5.1 family on 2026-07-23 (`gpt-5.1`, `gpt-5.1-mini` and friends). Those ids are listed in `RETIRED_API_MODELS` so they can never be reintroduced silently.
- Changing a mapping means a **new forward-only migration** — committed migrations are never edited, and model rows are deprecated rather than deleted.
