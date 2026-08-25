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
 * Provider registry wiring (PRD §26). Per-request routing by the selected
 * account's integration mode (M6 gate decision):
 * - no account          → MockAdapter (clearly-labeled simulation)
 * - `official_api` mode → HttpStreamAdapter → our proxy route → official API
 * - `manual` mode       → handled in the UI before the adapter is reached
 *   (the user performs the provider interaction; PRD §7); reaching the
 *   adapter anyway is an error.
 */

/** Providers with a live proxy route (server half of official_api mode). */
const PROXY_ENDPOINTS: Partial<Record<ProviderSlug, string>> = {
  claude: "/api/providers/claude",
};

class RoutingAdapter implements AIProviderAdapter {
  readonly kind = "routing";
  readonly slug: ProviderSlug;
  private readonly mock: MockAdapter;
  private readonly officialApi?: HttpStreamAdapter;

  constructor(entry: ProviderCatalogEntry) {
    this.slug = entry.meta.slug;
    this.mock = new MockAdapter({
      slug: entry.meta.slug,
      providerName: entry.meta.name,
      models: entry.models,
    });
    const endpoint = PROXY_ENDPOINTS[entry.meta.slug];
    if (endpoint) {
      this.officialApi = new HttpStreamAdapter({
        slug: entry.meta.slug,
        endpoint,
        models: entry.models,
        getAuthToken: () => getProviderKey(this.slug),
      });
    }
  }

  async connect(): Promise<void> {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { state: "connected" };
  }

  async getModels(): Promise<ModelInfo[]> {
    return this.mock.getModels();
  }

  async sendMessage(request: ProviderMessageRequest): Promise<ProviderResponse> {
    const mode = request.account?.integrationMode;
    if (mode === "official_api") {
      if (!this.officialApi) {
        throw providerError(
          "UNSUPPORTED_ACTION",
          this.slug,
          "Official API mode is not available for this provider yet"
        );
      }
      return this.officialApi.sendMessage(request);
    }
    if (mode === "manual") {
      throw providerError(
        "UNSUPPORTED_ACTION",
        this.slug,
        "Manual mode is user-mediated — handled by the chat UI"
      );
    }
    return this.mock.sendMessage(request);
  }
}

export function createRegistryFromCatalog(catalog: Catalog): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const entry of catalog) {
    registry.register({
      slug: entry.meta.slug,
      enabled: entry.enabled,
      integrationStatus:
        PROXY_ENDPOINTS[entry.meta.slug] !== undefined ? "manual" : "disabled",
      createAdapter: () => new RoutingAdapter(entry),
    });
  }
  return registry;
}
