import type {
  MessageRole,
  MessageStatus,
  ProviderSelection,
} from "@uaw/types";

/**
 * Mock chat engine (Milestone 2). Produces clearly-labeled fake replies with
 * simulated incremental rendering — it never pretends a real provider is
 * streaming (PRD §34). Replaced by the provider adapter registry at
 * Milestone 4; messages persist to Supabase since Milestone 3.
 */

/** A message as held in UI state (persisted via chat actions since M3). */
export interface UiChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  /** Provider/model/account that produced an assistant message (PRD §23–24). */
  selection?: ProviderSelection;
  createdAt: number;
}

const CHUNK_INTERVAL_MS = 35;
const INITIAL_DELAY_MS = 350;

function buildMockReply(
  providerName: string,
  modelName: string,
  prompt: string
): string {
  const quoted = prompt.length > 160 ? `${prompt.slice(0, 160)}…` : prompt;

  return [
    `This is a mock ${providerName} (${modelName}) reply — no real provider is connected yet. Real integrations arrive with Milestone 6, after the compliance gate.`,
    `You said: “${quoted}”`,
    `This thread is a Master Conversation: switch the provider or model in the header and send another message — every reply stays in the same conversation, each labeled with the provider that produced it.`,
  ].join("\n\n");
}

/**
 * Streams a mock reply word by word. Returns a cancel function; after
 * cancellation no further callbacks fire.
 */
export function streamMockReply(
  names: { providerName: string; modelName: string },
  prompt: string,
  callbacks: {
    onChunk: (text: string) => void;
    onComplete: () => void;
  }
): () => void {
  const words = buildMockReply(
    names.providerName,
    names.modelName,
    prompt
  ).split(/(?<=\s)/);
  let index = 0;
  let interval: ReturnType<typeof setInterval> | undefined;

  const timeout = setTimeout(() => {
    interval = setInterval(() => {
      if (index >= words.length) {
        clearInterval(interval);
        callbacks.onComplete();
        return;
      }
      callbacks.onChunk(words[index]);
      index += 1;
    }, CHUNK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  return () => {
    clearTimeout(timeout);
    if (interval !== undefined) clearInterval(interval);
  };
}
