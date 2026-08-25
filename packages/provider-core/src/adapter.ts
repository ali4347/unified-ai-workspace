import type {
  MessageRole,
  ModelInfo,
  ProviderAccountInfo,
  ProviderConnectionState,
  ProviderSlug,
} from "@uaw/types";

/**
 * Common provider adapter contract (PRD §25). Adapters are the ONLY place
 * provider-specific logic may live (PRD rules 6, 12); everything else talks
 * to this interface through the registry.
 */

/** A context message handed to a provider (built by the context engine, M8). */
export interface ProviderChatMessage {
  role: MessageRole;
  content: string;
}

export interface ProviderMessageRequest {
  /** Conversation context, oldest first. The final entry is the new prompt. */
  messages: ProviderChatMessage[];
  model: ModelInfo;
  account?: ProviderAccountInfo;
  /** Abort to stop generation (PRD §22 "stop generation"). */
  signal?: AbortSignal;
  /** Incremental output where the integration supports it (PRD §34). */
  onChunk?: (text: string) => void;
}

export interface ProviderResponse {
  content: string;
  status: "completed" | "cancelled";
  /** True when the reply was produced by a mock adapter — the UI must label
   * it honestly (SECURITY.md mock policy). */
  mock?: boolean;
}

export interface ConnectionStatus {
  state: ProviderConnectionState;
  detail?: string;
}

export interface UsageState {
  limited: boolean;
  detail?: string;
}

export interface AIProviderAdapter {
  readonly slug: ProviderSlug;
  /** Human-readable adapter kind, e.g. "mock", "manual", "official_api". */
  readonly kind: string;

  connect(): Promise<void>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  getModels(): Promise<ModelInfo[]>;
  createConversation?(): Promise<string>;
  sendMessage(request: ProviderMessageRequest): Promise<ProviderResponse>;
  stopGeneration?(): Promise<void>;
  detectUsageLimit?(): Promise<UsageState>;
}
