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
 * Server half of the OpenAI integration. Streams replies for both connection
 * modes: Workspace (server-held OPENAI_API_KEY, subject to the daily usage
 * quota) and BYOK (the user's own key, arriving per request). Neither is ever
 * stored or logged (PRD §19, §48). Raw fetch + SSE parsing; no SDK needed.
 *
 * Endpoint choice re-verified 2026-08-27: /v1/chat/completions is not
 * deprecated and every mapped GPT-5.6 model lists it as supported.
 * Model ids come from the database (`models.capabilities.api_model`) and fall
 * back to the verified table in lib/providers/model-map.ts.
 */

const OPENAI_BASE = "https://api.openai.com/v1";
const MAX_OUTPUT_TOKENS = 16_000;

export async function handleChatGptProxy(request: Request): Promise<Response> {
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
    const response = await fetch(`${OPENAI_BASE}/models?limit=1`, {
      headers: { authorization: `Bearer ${candidate}` },
    }).catch(() => null);
    if (!response) {
      return errorResponse(502, "NETWORK_ERROR", "Could not reach OpenAI");
    }
    if (!response.ok) return mapOpenAiError(response.status);
    return NextResponse.json({ ok: true });
  }

  const invalid = validateChatBody(body);
  if (invalid) return errorResponse(400, "NETWORK_ERROR", invalid);

  const apiModel =
    (await resolveApiModel("chatgpt", body.model as string)) ??
    fallbackApiModel("chatgpt", body.model as string);
  if (!apiModel) {
    return errorResponse(404, "MODEL_UNAVAILABLE", "Unknown ChatGPT model");
  }

  // Decides workspace vs BYOK and enforces availability, configuration and quota.
  const credential = await resolveCredential(
    "chatgpt",
    request,
    body.model as string
  );
  if (!credential.ok) return credential.response;
  const apiKey = credential.apiKey;

  const messages: Array<{ role: string; content: string }> = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  for (const message of body.messages ?? []) {
    messages.push({ role: message.role, content: message.content });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: apiModel,
        messages,
        stream: true,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: request.signal,
    });
  } catch {
    return errorResponse(502, "NETWORK_ERROR", "Could not reach OpenAI");
  }

  if (!upstream.ok) return mapOpenAiError(upstream.status);
  if (!upstream.body) {
    return errorResponse(502, "NETWORK_ERROR", "Empty response from OpenAI");
  }

  // Re-stream SSE deltas as plain text chunks (the proxy contract).
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            for (const line of event.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const text = parsed.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // Skip malformed SSE fragments.
              }
            }
          }
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
      void reader.cancel();
    },
  });

  return new Response(readable, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Maps OpenAI HTTP errors to normalized codes; messages stay generic. */
function mapOpenAiError(status: number): NextResponse {
  if (status === 401) {
    return errorResponse(401, "LOGIN_REQUIRED", "Invalid OpenAI API key");
  }
  if (status === 403) {
    return errorResponse(403, "LOGIN_REQUIRED", "Key lacks access to this model");
  }
  if (status === 404) {
    return errorResponse(404, "MODEL_UNAVAILABLE", "Model not available");
  }
  // OpenAI answers a retired or inaccessible model id with 400 — surface it as
  // unavailable so the user can pick another model instead of a generic error.
  if (status === 400) {
    return errorResponse(
      400,
      "MODEL_UNAVAILABLE",
      "This model is not available for your OpenAI account"
    );
  }
  if (status === 429) {
    return errorResponse(429, "USAGE_LIMIT", "OpenAI rate limit or quota reached");
  }
  return errorResponse(502, "NETWORK_ERROR", "OpenAI API error");
}
