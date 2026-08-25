import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  errorResponse,
  readProviderKey,
  requirePortalUser,
  resolveApiModel,
  checkRateLimit,
  validateChatBody,
  type ProxyRequestBody,
} from "@/lib/providers/server/proxy";

/**
 * Server half of the Claude `official_api` adapter (M6). Streams replies from
 * the official Anthropic API using the user's own key, forwarded per request
 * from their browser. The key is never stored or logged (PRD §19, §48).
 *
 * `claude-opus-5` requests opt into server-side refusal fallbacks
 * (`fallbacks: "default"`) so a safety decline reroutes instead of dead-ending.
 */

const MAX_OUTPUT_TOKENS = 16_000;

// Fallback mapping if the DB migration hasn't been applied yet.
const FALLBACK_API_MODELS: Record<string, string> = {
  "claude-sonnet": "claude-sonnet-5",
  "claude-opus": "claude-opus-5",
  "claude-haiku": "claude-haiku-4-5",
};

export async function handleClaudeProxy(request: Request): Promise<Response> {
  const userId = await requirePortalUser();
  if (!userId) {
    return errorResponse(401, "LOGIN_REQUIRED", "Sign in to use the proxy");
  }
  if (!checkRateLimit(userId)) {
    return errorResponse(429, "USAGE_LIMIT", "Too many requests — slow down");
  }

  const apiKey = readProviderKey(request);
  if (!apiKey) {
    return errorResponse(401, "LOGIN_REQUIRED", "Missing Anthropic API key");
  }

  let body: ProxyRequestBody;
  try {
    body = (await request.json()) as ProxyRequestBody;
  } catch {
    return errorResponse(400, "NETWORK_ERROR", "Invalid JSON body");
  }

  const client = new Anthropic({ apiKey });

  if (body.action === "validate") {
    try {
      await client.models.list({ limit: 1 });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return mapAnthropicError(error);
    }
  }

  const invalid = validateChatBody(body);
  if (invalid) return errorResponse(400, "NETWORK_ERROR", invalid);

  const apiModel =
    (await resolveApiModel("claude", body.model as string)) ??
    FALLBACK_API_MODELS[body.model as string];
  if (!apiModel) {
    return errorResponse(404, "MODEL_UNAVAILABLE", "Unknown Claude model");
  }

  const messages = (body.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const stream =
      apiModel === "claude-opus-5"
        ? client.beta.messages.stream({
            model: apiModel,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: body.system || undefined,
            messages,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          })
        : client.messages.stream({
            model: apiModel,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: body.system || undefined,
            messages,
          });

    request.signal.addEventListener("abort", () => {
      stream.controller.abort();
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let emittedAny = false;
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta" &&
              event.delta.text
            ) {
              emittedAny = true;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === "refusal" && !emittedAny) {
            controller.enqueue(
              encoder.encode("(Claude declined this request for safety reasons.)")
            );
          }
          controller.close();
        } catch (error) {
          if (request.signal.aborted) {
            controller.close();
          } else {
            controller.error(error);
          }
        }
      },
      cancel() {
        stream.controller.abort();
      },
    });

    return new Response(readable, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapAnthropicError(error);
  }
}

/** Maps SDK errors to normalized provider error codes (PRD §47). Messages
 * are generic — never include the key or request content. */
function mapAnthropicError(error: unknown): NextResponse {
  if (error instanceof Anthropic.AuthenticationError) {
    return errorResponse(401, "LOGIN_REQUIRED", "Invalid Anthropic API key");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return errorResponse(403, "LOGIN_REQUIRED", "Key lacks access to this model");
  }
  if (error instanceof Anthropic.NotFoundError) {
    return errorResponse(404, "MODEL_UNAVAILABLE", "Model not available");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return errorResponse(429, "USAGE_LIMIT", "Anthropic rate limit reached");
  }
  if (error instanceof Anthropic.APIError) {
    return errorResponse(502, "NETWORK_ERROR", "Anthropic API error");
  }
  return errorResponse(502, "NETWORK_ERROR", "Provider request failed");
}
