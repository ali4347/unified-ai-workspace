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
