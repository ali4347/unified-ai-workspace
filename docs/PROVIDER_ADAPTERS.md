# Provider adapters

Adapters are the only place provider-specific logic may live (PRD rules 6, 12). The rest of the app talks to the common interface and the registry, both implemented in `packages/provider-core` (Milestone 4). Streaming uses an `onChunk` callback; cancellation uses `AbortSignal`.

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

| Provider | Status | Planned milestone | Notes |
| --- | --- | --- | --- |
| Mock | active (M4 ✅) | M4 | `MockAdapter` in provider-core drives development; clearly labeled, never impersonates a real provider; used whenever no account is connected |
| Claude | `manual` + optional `official_api` (M6 ✅) | M6 | See the M6 compliance record below |
| ChatGPT | `disabled` | M7 | Same approved modes planned; enabled at M7 |
| Gemini | `disabled` | Phase 2 | — |
| Perplexity | `disabled` | Phase 2 | — |
| Copilot | `disabled` | Phase 2 | — |

## Milestone 6 compliance record — Claude (2026-08-25)

1. **ToS review:** Anthropic's consumer terms (claude.ai) prohibit automated/programmatic access to the consumer web app; the Anthropic **API** terms permit programmatic use with the account holder's own API key. Conclusion unchanged from the standing engineering position in `docs/SECURITY.md`.
2. **Mechanism check:** `manual` mode automates nothing — the app builds a context package, the user performs the provider interaction in their own session and pastes the reply back. `official_api` mode calls the official Anthropic API through a server proxy with the user's own key, which is held in the user's browser (localStorage) and forwarded per request only — never stored, logged or persisted server-side. No cookies touched, no passwords requested/stored, no limits/CAPTCHA/anti-automation circumvented.
3. **Failure modes** mapped to normalized codes in the proxy (`LOGIN_REQUIRED` for invalid/missing key, `MODEL_UNAVAILABLE`, `USAGE_LIMIT` for provider rate limits, `NETWORK_ERROR`) and surfaced by `HttpStreamAdapter`.
4. **Usage limits:** surfaced as `USAGE_LIMIT` + the user can switch providers; never bypassed (PRD §35).
5. **Product-owner sign-off:** recorded 2026-08-25 — mode decision "Manual + Official API" approved by the product owner (session decision, AskUserQuestion).

Implementation notes: client half = `HttpStreamAdapter` (provider-core, generic); server half = `apps/web/src/app/api/providers/claude` + `lib/providers/server/claude.ts` (the only place Claude-specific logic lives). `claude-opus-5` requests enable Anthropic's server-side refusal fallbacks (`fallbacks: "default"`) so a safety decline reroutes to a fallback model instead of dead-ending.
