import type {
  MessageRole,
  MessageStatus,
  ProviderSelection,
} from "@uaw/types";

/** A message as held in chat UI state (persisted via chat actions). */
export interface UiChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  /** Provider/model/account that produced an assistant message (PRD §23–24). */
  selection?: ProviderSelection;
  createdAt: number;
}
