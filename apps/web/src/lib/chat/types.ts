import type {
  IntegrationMode,
  MessageRole,
  MessageStatus,
  ProviderSelection,
} from "@uaw/types";

/** How an assistant message was produced — "mock" for simulated replies,
 * otherwise the account's integration mode. Shown on the provider badge. */
export type MessageIntegration = IntegrationMode | "mock";

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
