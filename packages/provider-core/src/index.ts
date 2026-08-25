/**
 * @uaw/provider-core — provider adapter architecture (Milestone 4, PRD
 * §25–26). Contains NO website-specific automation; real integrations are
 * gated on the Milestone 6 compliance review (docs/PROVIDER_ADAPTERS.md).
 */
export type {
  AIProviderAdapter,
  ConnectionStatus,
  ProviderChatMessage,
  ProviderMessageRequest,
  ProviderResponse,
  UsageState,
} from "./adapter";
export {
  isProviderError,
  ProviderAdapterError,
  providerError,
} from "./errors";
export { ProviderEventBus, type ProviderEvent } from "./events";
export { MockAdapter, type MockAdapterConfig } from "./mock-adapter";
export { ProviderRegistry, type ProviderRegistration } from "./registry";
