/**
 * Pure request validation + rate limiting for provider proxy routes.
 * Separated from proxy.ts (which pulls in Supabase/next-headers) so it can
 * be unit-tested directly (M9).
 */

export const MAX_MESSAGES = 80;
export const MAX_TOTAL_CHARS = 300_000;
export const MAX_KEY_LENGTH = 512;

export interface ProxyChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProxyRequestBody {
  action?: "validate";
  model?: string;
  system?: string;
  messages?: ProxyChatMessage[];
}

/** Validates the chat payload. Returns an error string on invalid input
 * (safe to echo — contains no user content). */
export function validateChatBody(body: ProxyRequestBody): string | null {
  if (!body.model || typeof body.model !== "string") return "model required";
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return "messages required";
  }
  if (body.messages.length > MAX_MESSAGES) return "too many messages";
  let total = 0;
  for (const message of body.messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      return "invalid message role";
    }
    if (typeof message.content !== "string") return "invalid message content";
    total += message.content.length;
  }
  if (typeof body.system === "string") total += body.system.length;
  if (total > MAX_TOTAL_CHARS) return "context too large";
  return null;
}

/** Extracts the user-supplied provider key. Never log or persist it. */
export function readProviderKey(request: Request): string | null {
  const key = request.headers.get("x-provider-key");
  if (!key || key.length > MAX_KEY_LENGTH) return null;
  return key;
}

// Simple per-user sliding-window rate limit. In-memory per server instance —
// a backstop against runaway loops, not a billing control (the key is the
// user's own, so they bear their own provider costs).
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestLog = new Map<string, number[]>();

export function checkRateLimit(userId: string, now = Date.now()): boolean {
  const entries = (requestLog.get(userId) ?? []).filter(
    (t) => now - t < WINDOW_MS
  );
  if (entries.length >= MAX_REQUESTS_PER_WINDOW) {
    requestLog.set(userId, entries);
    return false;
  }
  entries.push(now);
  requestLog.set(userId, entries);
  return true;
}
