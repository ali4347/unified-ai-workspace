# Provider adapters

Adapters are the only place provider-specific logic may live (PRD rules 6, 12). The rest of the app talks to the common interface and the registry. Implementation lands in `packages/provider-core` at Milestone 4 (mock adapters first).

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
| Mock | — | M4 | Drives all UI development; clearly labeled, never impersonates a real provider |
| Claude | `disabled` | M6/M7 | Compliant mode TBD at the M6 gate: `official_api` or `manual` (consumer-site automation is not permitted by current Anthropic consumer terms) |
| ChatGPT | `disabled` | M6/M7 | Same gate; OpenAI consumer terms likewise prohibit automated access to chatgpt.com |
| Gemini | `disabled` | Phase 2 | — |
| Perplexity | `disabled` | Phase 2 | — |
| Copilot | `disabled` | Phase 2 | — |

See `docs/MILESTONES.md` → "Milestone 6 compliance gate" for the decision that must be made with the product owner.
