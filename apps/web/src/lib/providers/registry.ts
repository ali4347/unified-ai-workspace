import {
  HttpStreamAdapter,
  MockAdapter,
  ProviderRegistry,
  providerError,
  type AIProviderAdapter,
  type ConnectionStatus,
  type ProviderMessageRequest,
  type ProviderResponse,
} from "@uaw/provider-core";
import type { ModelInfo, ProviderSlug } from "@uaw/types";
import type { Catalog, ProviderCatalogEntry } from "@/lib/providers/catalog";
import { getProviderKey } from "@/lib/providers/key-store";

/**
 * Provider routing (PRD §26). Production has exactly ONE execution mode:
 * Bring Your Own API — the user's own OpenAI/Anthropic developer key, held in
 * their browser and forwarded per request to our same-origin proxy.
 *
 * Everything else is refused rather than approximated:
 *   no connection selected   → PROVIDER not connected (never a mock reply)
 *   retired `manual` record  → refused; those rows exist only so historical
 *                              messages keep rendering
 *   provider with no proxy   → refused
 *
 * The mock adapter is retained for tests and local development and is reachable
 * only behind an explicit opt-in flag. Production must never silently simulate
 * an answer: a fabricated reply that looks real is worse than a clear error.
 */

/** Providers with a live proxy route (the server half of BYOK). */
const PROXY_ENDPOINTS: Partial<Record<ProviderSlug, string>> = {
  claude: "/api/providers/claude",
  chatgpt: "/api/providers/chatgpt",
};

/** Dev/test escape hatch. Never set in production. */
const MOCK_ENABLED =
  process.env.NEXT_PUBLIC_UAW_ENABLE_MOCK_PROVIDERS === "true";

class RoutingAdapter implements AIProviderAdapter {
  readonly kind = "routing";
  readonly slug: ProviderSlug;
  private readonly providerName: string;
  private readonly models: ModelInfo[];
  private readonly mock: MockAdapter;
  private readonly byok?: HttpStreamAdapter;

  constructor(entry: ProviderCatalogEntry) {
    this.slug = entry.meta.slug;
    this.providerName = entry.meta.name;
    this.models = entry.models;
    this.mock = new MockAdapter({
      slug: entry.meta.slug,
      providerName: entry.meta.name,
      models: entry.models,
    });
    const endpoint = PROXY_ENDPOINTS[entry.meta.slug];
    if (endpoint) {
      this.byok = new HttpStreamAdapter({
        slug: entry.meta.slug,
        endpoint,
        models: entry.models,
        getAuthToken: () => getProviderKey(this.slug),
      });
    }
  }

  async connect(): Promise<void> {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return getProviderKey(this.slug)
      ? { state: "connected", detail: "API key present in this browser" }
      : { state: "login_required", detail: "No API key stored" };
  }

  async getModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  async sendMessage(request: ProviderMessageRequest): Promise<ProviderResponse> {
    const account = request.account;

    if (!account) {
      if (MOCK_ENABLED) return this.mock.sendMessage(request);
      throw providerError(
        "UNSUPPORTED_ACTION",
        this.slug,
        `Connect your ${this.providerName} API key in Settings to start chatting.`
      );
    }

    if (account.legacy || account.integrationMode === "manual") {
      throw providerError(
        "UNSUPPORTED_ACTION",
        this.slug,
        "This connection used the retired copy-and-paste mode. Connect an API key in Settings to keep chatting."
      );
    }

    if (!this.byok) {
      throw providerError(
        "UNSUPPORTED_ACTION",
        this.slug,
        `${this.providerName} is not available yet.`
      );
    }

    return this.byok.sendMessage(request);
  }
}

export function createRegistryFromCatalog(catalog: Catalog): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const entry of catalog) {
    registry.register({
      slug: entry.meta.slug,
      enabled: entry.enabled,
      integrationStatus:
        PROXY_ENDPOINTS[entry.meta.slug] !== undefined
          ? "official_api"
          : "disabled",
      createAdapter: () => new RoutingAdapter(entry),
    });
  }
  return registry;
}
