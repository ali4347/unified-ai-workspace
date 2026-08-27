import type { ProviderChatMessage } from "@uaw/provider-core";
import type { UiChatMessage } from "@/lib/chat/types";

/**
 * Context Handoff Engine (PRD §11–12). Transforms the Master Conversation
 * into context for the next provider. This is what lets one conversation
 * survive a provider switch, and it feeds every automatic BYOK call:
 *
 *   A `full_history`      — everything fits the budget
 *   B `recent_messages`   — recent window only (no summary exists yet)
 *   C `summary_recent`    — rolling summary + recent window
 *   D adds project instructions to the system prompt whenever present
 *
 * Strategy selection is automatic (PRD §11). The rolling summary is a
 * deterministic extractive digest — recomputed from the folded prefix, so it
 * needs no model API (PRD §6) and no incremental state.
 */

export type ContextStrategy =
  | "full_history"
  | "recent_messages"
  | "summary_recent";

export interface BuiltContext {
  system?: string;
  messages: ProviderChatMessage[];
  strategy: ContextStrategy;
  /** Messages included verbatim (excluding the new prompt). */
  includedMessages: number;
  summaryChars: number;
}

// chars/4 is a rough universal token estimate — deliberately conservative.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CONTEXT_BUDGET_TOKENS = 24_000;
const RECENT_BUDGET_TOKENS = 12_000;
const MIN_RECENT_MESSAGES = 2;
const SUMMARY_LINE_CHARS = 220;
export const MAX_SUMMARY_CHARS = 8_000;

const BASE_SYSTEM =
  "You are participating in a Master Conversation in the user's Unified AI Workspace. " +
  "Earlier assistant turns may have been produced by other AI providers — continue the work seamlessly.";

function usable(history: UiChatMessage[]): UiChatMessage[] {
  return history.filter(
    (m) =>
      m.content.length > 0 &&
      (m.role === "user" || m.role === "assistant") &&
      m.status !== "failed"
  );
}

/** Deterministic extractive digest of a folded message prefix (PRD §12). */
export function digestMessages(messages: UiChatMessage[]): string {
  const lines = messages.map((m) => {
    const content = m.content.replace(/\s+/g, " ").trim();
    const clipped =
      content.length > SUMMARY_LINE_CHARS
        ? `${content.slice(0, SUMMARY_LINE_CHARS)}…`
        : content;
    return `- ${m.role === "user" ? "User" : "Assistant"}: ${clipped}`;
  });
  // Keep the newest lines if the digest itself overflows.
  let digest = lines.join("\n");
  while (digest.length > MAX_SUMMARY_CHARS && lines.length > 1) {
    lines.shift();
    digest = `(earlier context omitted)\n${lines.join("\n")}`;
  }
  return digest;
}

interface Split {
  folded: UiChatMessage[];
  recent: UiChatMessage[];
}

/** Recent window by token budget, never fewer than MIN_RECENT_MESSAGES. */
function splitRecent(messages: UiChatMessage[]): Split {
  let tokens = 0;
  let start = messages.length;
  while (start > 0) {
    const next = tokens + estimateTokens(messages[start - 1].content);
    if (
      next > RECENT_BUDGET_TOKENS &&
      messages.length - (start - 1) > MIN_RECENT_MESSAGES
    ) {
      break;
    }
    tokens = next;
    start -= 1;
  }
  return { folded: messages.slice(0, start), recent: messages.slice(start) };
}

export function buildProviderContext(options: {
  history: UiChatMessage[];
  prompt: string;
  projectInstructions?: string | null;
}): BuiltContext {
  const history = usable(options.history);
  const systemParts = [BASE_SYSTEM];
  if (options.projectInstructions) {
    systemParts.push(`Project instructions:\n${options.projectInstructions}`);
  }

  const totalTokens =
    history.reduce((sum, m) => sum + estimateTokens(m.content), 0) +
    estimateTokens(options.prompt);

  let strategy: ContextStrategy = "full_history";
  let included = history;
  let summary = "";

  if (totalTokens > CONTEXT_BUDGET_TOKENS) {
    const { folded, recent } = splitRecent(history);
    included = recent;
    summary = digestMessages(folded);
    strategy = summary.length > 0 ? "summary_recent" : "recent_messages";
    if (summary) {
      systemParts.push(
        `Summary of the earlier conversation (older messages were omitted):\n${summary}`
      );
    }
  }

  const messages: ProviderChatMessage[] = included.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  messages.push({ role: "user", content: options.prompt });

  return {
    system: systemParts.join("\n\n"),
    messages,
    strategy,
    includedMessages: included.length,
    summaryChars: summary.length,
  };
}

/** Rolling summary to persist on the conversation (PRD §12): digest of the
 * part that no longer fits the recent window; empty while everything fits. */
export function rollingSummary(history: UiChatMessage[]): string {
  const messages = usable(history);
  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0
  );
  if (totalTokens <= CONTEXT_BUDGET_TOKENS) return "";
  return digestMessages(splitRecent(messages).folded);
}

