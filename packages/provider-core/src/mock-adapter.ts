import type { ModelInfo, ProviderSlug } from "@uaw/types";
import type {
  AIProviderAdapter,
  ConnectionStatus,
  ProviderMessageRequest,
  ProviderResponse,
  UsageState,
} from "./adapter";
import { providerError } from "./errors";

/**
 * Mock adapter (Milestone 4). Powers all UI development until a compliant
 * real integration exists (M6). Replies are clearly labeled as mock and the
 * simulated streaming never pretends to be a real provider (PRD §34,
 * SECURITY.md mock policy).
 */

const CHUNK_INTERVAL_MS = 35;
const INITIAL_DELAY_MS = 350;

export interface MockAdapterConfig {
  slug: ProviderSlug;
  providerName: string;
  models: ModelInfo[];
}

export class MockAdapter implements AIProviderAdapter {
  readonly kind = "mock";
  readonly slug: ProviderSlug;
  private readonly providerName: string;
  private readonly models: ModelInfo[];

  constructor(config: MockAdapterConfig) {
    this.slug = config.slug;
    this.providerName = config.providerName;
    this.models = config.models;
  }

  async connect(): Promise<void> {
    // Nothing to connect to.
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { state: "connected", detail: "Mock adapter" };
  }

  async getModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  async detectUsageLimit(): Promise<UsageState> {
    return { limited: false };
  }

  sendMessage(request: ProviderMessageRequest): Promise<ProviderResponse> {
    const prompt = request.messages.at(-1)?.content ?? "";
    const reply = this.buildReply(request.model, prompt);
    const words = reply.split(/(?<=\s)/);

    return new Promise((resolve, reject) => {
      if (request.signal?.aborted) {
        resolve({ content: "", status: "cancelled", mock: true });
        return;
      }

      let emitted = "";
      let index = 0;
      let interval: ReturnType<typeof setInterval> | undefined;

      const cleanup = () => {
        clearTimeout(timeout);
        if (interval !== undefined) clearInterval(interval);
        request.signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        resolve({ content: emitted, status: "cancelled", mock: true });
      };
      request.signal?.addEventListener("abort", onAbort);

      const timeout = setTimeout(() => {
        interval = setInterval(() => {
          if (index >= words.length) {
            cleanup();
            resolve({ content: emitted, status: "completed", mock: true });
            return;
          }
          const chunk = words[index];
          emitted += chunk;
          index += 1;
          try {
            request.onChunk?.(chunk);
          } catch (error) {
            cleanup();
            reject(
              providerError(
                "NETWORK_ERROR",
                this.slug,
                error instanceof Error ? error.message : "chunk handler failed"
              )
            );
          }
        }, CHUNK_INTERVAL_MS);
      }, INITIAL_DELAY_MS);
    });
  }

  private buildReply(model: ModelInfo, prompt: string): string {
    const quoted = prompt.length > 160 ? `${prompt.slice(0, 160)}…` : prompt;
    return [
      `Simulated ${this.providerName} (${model.name}) reply — this workspace is running in mock mode, so no provider was contacted.`,
      `You said: “${quoted}”`,
      `Connect a ${this.providerName} account in Settings to exchange real messages. Replies stay in this Master Conversation whichever provider produces them.`,
    ].join("\n\n");
  }
}
