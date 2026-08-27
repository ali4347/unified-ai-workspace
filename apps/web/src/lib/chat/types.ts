import type {
  ConnectionMode,
  IntegrationMode,
  MessageRole,
  MessageStatus,
  ProviderSelection,
} from "@uaw/types";

/**
 * How an assistant message was produced, shown on the provider badge.
 * `workspace` / `byok` are the live modes. `manual` and `official_api` are
 * historical values still present on stored messages — they must keep
 * rendering, so they stay in the union. `mock` is dev-only.
 */
export type MessageIntegration = ConnectionMode | IntegrationMode | "mock";

/** A message as held in chat UI state (persisted via chat actions). */
export interface UiChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  /** Provider/model/account that produced an assistant message (PRD §23–24). */
  selection?: ProviderSelection;
  integration?: MessageIntegration;
  createdAt: number;
}
