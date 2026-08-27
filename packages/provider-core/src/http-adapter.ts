import type { ModelInfo, ProviderSlug } from "@uaw/types";
import type {
  AIProviderAdapter,
  ConnectionStatus,
  ProviderMessageRequest,
  ProviderResponse,
  UsageState,
} from "./adapter";
import { providerError } from "./errors";
import type { ProviderErrorCode } from "@uaw/types";

/**
 * Streams from a same-origin server proxy route that holds ALL
 * provider-specific logic. Serves both connection modes:
 *
 *   Workspace  — no `x-provider-key` header; the route uses the server-held
 *                credential, which never reaches the browser.
 *   BYOK       — the user's key is injected per request via `getAuthToken`
 *                (browser-held, never persisted server-side, PRD §19).
 *
 * Proxy contract: POST endpoint, JSON body { model, system?, messages },
 * optional `x-provider-key` header; 200 → plain text stream of reply chunks;
 * non-200 → JSON { code, message } with a normalized error code.
 */
export interface HttpStreamAdapterConfig {
  slug: ProviderSlug;
  endpoint: string;
  models: ModelInfo[];
  /** Returns the user's API key (from browser storage) or null. */
  getAuthToken: () => string | null;
  /**
   * When true the request is refused if no token is available, instead of
   * being sent without one. Bring-Your-Own-API callers MUST set this: sending
   * a keyless request would silently fall through to the workspace credential
   * and bill the wrong account. Workspace callers leave it false — the server
   * supplies the credential and the browser never holds one.
   */
  requireAuthToken?: boolean;
}

const ERROR_CODES: readonly ProviderErrorCode[] = [
  "LOGIN_REQUIRED",
  "SESSION_EXPIRED",
  "MODEL_UNAVAILABLE",
  "USAGE_LIMIT",
  "PROVIDER_CHANGED",
  "NETWORK_ERROR",
  "UNSUPPORTED_ACTION",
];

export class HttpStreamAdapter implements AIProviderAdapter {
  readonly kind = "official_api";
  readonly slug: ProviderSlug;
  private readonly config: HttpStreamAdapterConfig;

  constructor(config: HttpStreamAdapterConfig) {
    this.slug = config.slug;
    this.config = config;
  }

  async connect(): Promise<void> {
    // Connection is established by saving a key; nothing to do here.
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    if (!this.config.requireAuthToken) {
      return { state: "connected", detail: "Workspace credential (server-held)" };
    }
    return this.config.getAuthToken()
      ? { state: "connected", detail: "API key present" }
      : { state: "login_required", detail: "No API key stored" };
  }

  async getModels(): Promise<ModelInfo[]> {
    return this.config.models;
  }

  async detectUsageLimit(): Promise<UsageState> {
    return { limited: false };
  }

  async sendMessage(request: ProviderMessageRequest): Promise<ProviderResponse> {
    const token = this.config.getAuthToken();
    if (!token && this.config.requireAuthToken) {
      throw providerError(
        "LOGIN_REQUIRED",
        this.slug,
        "This connection has no API key in this browser. Re-enter it in Settings → AI usage, or switch to Workspace models."
      );
    }

    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Absent header = Workspace mode; the route uses its own credential.
          ...(token ? { "x-provider-key": token } : {}),
        },
        body: JSON.stringify({
          model: request.model.id,
          messages: request.messages,
        }),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal?.aborted) {
        return { content: "", status: "cancelled" };
      }
      throw providerError(
        "NETWORK_ERROR",
        this.slug,
        error instanceof Error ? error.message : "Request failed"
      );
    }

    if (!response.ok) {
      let code: ProviderErrorCode = "NETWORK_ERROR";
      let message = `Provider request failed (${response.status})`;
      try {
        const body = (await response.json()) as {
          code?: string;
          message?: string;
        };
        if (body.code && (ERROR_CODES as string[]).includes(body.code)) {
          code = body.code as ProviderErrorCode;
        }
        if (body.message) message = body.message;
      } catch {
        // Non-JSON error body — keep defaults.
      }
      throw providerError(code, this.slug, message);
    }

    if (!response.body) {
      throw providerError("NETWORK_ERROR", this.slug, "Empty response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          content += chunk;
          request.onChunk?.(chunk);
        }
      }
    } catch (error) {
      if (request.signal?.aborted) {
        return { content, status: "cancelled" };
      }
      throw providerError(
        "NETWORK_ERROR",
        this.slug,
        error instanceof Error ? error.message : "Stream interrupted"
      );
    }

    return { content, status: "completed" };
  }
}
