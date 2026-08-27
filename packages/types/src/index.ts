/**
 * @uaw/types — shared domain types for Unified AI Workspace.
 * Single source of truth per PRD §45. Provider-specific logic never lives here.
 */

// ---------------------------------------------------------------------------
// Providers (PRD §45)
// ---------------------------------------------------------------------------

export type ProviderSlug =
  | "claude"
  | "chatgpt"
  | "gemini"
  | "perplexity"
  | "copilot";

export type ProviderConnectionState =
  | "connected"
  | "disconnected"
  | "login_required"
  | "unsupported"
  | "error";

/** Compliance-reviewed integration mode of an adapter (PRD §7). */
export type IntegrationStatus =
  | "supported"
  | "experimental"
  | "disabled"
  | "manual"
  | "official_api";

/** Display metadata for providers. Models are NOT listed here (PRD §15) —
 * they come from provider configuration / the database at Milestone 3+. */
export interface ProviderMeta {
  slug: ProviderSlug;
  name: string;
  /** Which delivery phase the provider belongs to (PRD §50–52). */
  phase: "mvp" | "phase2";
}

export const PROVIDERS: readonly ProviderMeta[] = [
  { slug: "claude", name: "Claude", phase: "mvp" },
  { slug: "chatgpt", name: "ChatGPT", phase: "mvp" },
  { slug: "gemini", name: "Google Gemini", phase: "phase2" },
  { slug: "perplexity", name: "Perplexity", phase: "phase2" },
  { slug: "copilot", name: "Microsoft Copilot", phase: "phase2" },
] as const;

/** A model offered by a provider. Sourced from provider configuration
 * (mock catalog until Milestone 3 moves this to the database, PRD §15, §31). */
export interface ModelInfo {
  id: string;
  providerSlug: ProviderSlug;
  name: string;
  description?: string;
  /** Which connection modes may run this model. Defaults to "both". */
  availability?: ModelAvailability;
  /** False hides the model from selection entirely (kill switch). */
  enabled?: boolean;
  /** Optional label shown next to the model, e.g. "fast", "most capable". */
  tier?: string;
}

/** How a chat turn reaches a provider.
 * - `workspace`: Unified AI Workspace's own server-held provider credential.
 *   The user needs no key; the secret never leaves the server.
 * - `byok`: the user's own OpenAI/Anthropic API credential, held in their
 *   browser and forwarded per request. Their provider account is billed.
 * Consumer ChatGPT/Claude subscriptions are a separate product and are never
 * used: no session automation, no scraping (see docs/SECURITY.md). */
export type ConnectionMode = "workspace" | "byok";

/** Which connection modes a model may be used through. */
export type ModelAvailability = "workspace" | "byok" | "both";

/** Legacy per-account mode values persisted in `connected_accounts.metadata`.
 * `official_api` rows are read as `byok`. `manual` is retired: those rows and
 * their historical messages stay readable, but manual is not offered for new
 * conversations. */
export type IntegrationMode = "manual" | "official_api";

/** A connected provider account as shown in selectors (PRD §16).
 * Metadata only — never credentials (PRD §19). */
export interface ProviderAccountInfo {
  id: string;
  providerSlug: ProviderSlug;
  email: string;
  status: ProviderConnectionState;
  integrationMode?: IntegrationMode;
  /** Resolved connection mode: `official_api` rows read as `byok`; `manual`
   * rows are legacy and cannot be selected for new turns. */
  connectionMode?: ConnectionMode;
  /** True for retired `manual` records kept only so old chats stay readable. */
  legacy?: boolean;
}

/** The active provider/model/connection of a conversation (PRD §15–16, §31).
 * `accountId === null` means Workspace Models (server-held credential);
 * a non-null id selects one of the user's own Bring-Your-Own-API connections. */
export interface ProviderSelection {
  providerSlug: ProviderSlug;
  modelId: string;
  accountId: string | null;
}

/** Workspace mode is represented by the absence of a connected account. */
export function connectionModeOf(
  selection: Pick<ProviderSelection, "accountId">
): ConnectionMode {
  return selection.accountId === null ? "workspace" : "byok";
}

// ---------------------------------------------------------------------------
// Messages (PRD §23)
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "queued"
  | "sending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Errors (PRD §47)
// ---------------------------------------------------------------------------

export type ProviderErrorCode =
  | "LOGIN_REQUIRED"
  | "SESSION_EXPIRED"
  | "MODEL_UNAVAILABLE"
  | "USAGE_LIMIT"
  | "PROVIDER_CHANGED"
  | "NETWORK_ERROR"
  | "UNSUPPORTED_ACTION";

export interface ProviderError {
  code: ProviderErrorCode;
  provider: ProviderSlug;
  message: string;
  recoverable: boolean;
}

// ---------------------------------------------------------------------------
// Provider events (PRD §31 provider_events)
// ---------------------------------------------------------------------------

export type ProviderEventType =
  | "connected"
  | "disconnected"
  | "limit_detected"
  | "model_changed"
  | "request_failed"
  | "session_expired";
