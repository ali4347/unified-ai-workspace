import type { ProviderChatMessage } from "@uaw/provider-core";
import type { UiChatMessage } from "@/lib/chat/types";

/**
 * Context building for provider handoff (PRD §11). Milestone 6 baseline:
 * full history (Strategy A) — Milestone 8 adds recent-N, rolling summaries
 * and the strategy selector.
 */

export interface BuiltContext {
  system?: string;
  messages: ProviderChatMessage[];
}

const BASE_SYSTEM =
  "You are participating in a Master Conversation in the user's Unified AI Workspace. " +
  "Earlier assistant turns may have been produced by other AI providers — continue the work seamlessly.";

export function buildProviderContext(options: {
  history: UiChatMessage[];
  prompt: string;
  projectInstructions?: string | null;
}): BuiltContext {
  const system = options.projectInstructions
    ? `${BASE_SYSTEM}\n\nProject instructions:\n${options.projectInstructions}`
    : BASE_SYSTEM;

  const messages: ProviderChatMessage[] = options.history
    .filter(
      (m) =>
        m.content.length > 0 &&
        (m.role === "user" || m.role === "assistant") &&
        m.status !== "failed"
    )
    .map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: options.prompt });

  return { system, messages };
}

/** The copyable package for `manual` mode: the user pastes this into the
 * provider's own interface and brings the reply back (PRD §7 manual). */
export function buildManualPackage(options: {
  providerName: string;
  history: UiChatMessage[];
  prompt: string;
  projectInstructions?: string | null;
}): string {
  const parts: string[] = [];
  parts.push(
    "Continue this conversation. Earlier replies may come from other AI assistants."
  );
  if (options.projectInstructions) {
    parts.push(`Project instructions:\n${options.projectInstructions}`);
  }
  const transcript = options.history
    .filter((m) => m.content.length > 0 && m.status !== "failed")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  if (transcript) {
    parts.push(`Conversation so far:\n\n${transcript}`);
  }
  parts.push(`User: ${options.prompt}`);
  return parts.join("\n\n---\n\n");
}
