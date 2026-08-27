import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { fallbackApiModel } from "@/lib/providers/model-map";
import {
  errorResponse,
  readProviderKey,
  requirePortalUser,
  resolveApiModel,
  resolveCredential,
  checkRateLimit,
  validateChatBody,
  type ProxyRequestBody,
} from "@/lib/providers/server/proxy";

/**
 * Server half of the Anthropic integration. Streams replies for both
 * connection modes:
 *
 *   Workspace — no `x-provider-key` header; uses the server-held
 *               ANTHROPIC_API_KEY, subject to the daily usage quota.
 *   BYOK      — the user's own key arrives per request and is used verbatim.
 *
 * Neither credential is ever stored, logged, or echoed back (PRD §19, §48).
 * Model ids come from the database (`models.capabilities.api_model`) and fall
 * back to the verified table in lib/providers/model-map.ts.
 */

const MAX_OUTPUT_TOKENS = 16_000;

/** Models that support Anthropic's server-side refusal fallbacks, so a safety
 * decline reroutes to a fallback model instead of dead-ending. */
const SERVER_SIDE_FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5"]);

export async function handleClaudeProxy(request: Request): Promise<Response> {
  const userId = await requirePortalUser();
  if (!userId) {
    return errorResponse(401, "LOGIN_REQUIRED", "Sign in to use the proxy");
  }
  if (!checkRateLimit(userId)) {
    return errorResponse(429, "USAGE_LIMIT", "Too many requests — slow down");
  }

  let body: ProxyRequestBody;
  try {
    body = (await request.json()) as ProxyRequestBody;
  } catch {
    return errorResponse(400, "NETWORK_ERROR", "Invalid JSON body");
  }

  // Key validation is only meaningful for a key the user just entered.
  if (body.action === "validate") {
    const candidate = readProviderKey(request);
    if (!candidate) {
      return errorResponse(400, "LOGIN_REQUIRED", "No API key to validate");
    }
    try {
      await new Anthropic({ apiKey: candidate }).models.list({ limit: 1 });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return mapAnthropicError(error);
    }
  }

  const invalid = validateChatBody(body);
  if (invalid) return errorResponse(400, "NETWORK_ERROR", invalid);

  const apiModel =
    (await resolveApiModel("claude", body.model as string)) ??
    fallbackApiModel("claude", body.model as string);
  if (!apiModel) {
    return errorResponse(404, "MODEL_UNAVAILABLE", "Unknown Claude model");
  }

  // Decides workspace vs BYOK and enforces availability, configuration and quota.
  const credential = await resolveCredential(
    "claude",
    request,
    body.model as string
  );
  if (!credential.ok) return credential.response;
  const client = new Anthropic({ apiKey: credential.apiKey });

  const messages = (body.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const stream =
      SERVER_SIDE_FALLBACK_MODELS.has(apiModel)
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
  // A 400 here is usually a model the account cannot use on its current plan
  // or data-retention settings — report it as unavailable so the user can
  // switch model or provider instead of seeing a generic failure.
  if (error instanceof Anthropic.BadRequestError) {
    return errorResponse(
      400,
      "MODEL_UNAVAILABLE",
      "This model is not available for your Anthropic account"
    );
  }
  if (error instanceof Anthropic.APIError) {
    return errorResponse(502, "NETWORK_ERROR", "Anthropic API error");
  }
  return errorResponse(502, "NETWORK_ERROR", "Provider request failed");
}
