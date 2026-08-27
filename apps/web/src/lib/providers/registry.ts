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
 * Provider routing (PRD §26). One layer decides how a turn reaches a provider:
 *
 *   no account selected            → Workspace Models: the proxy route uses the
 *                                    server-held credential. No key in the
 *                                    browser, nothing for the user to set up.
 *   BYOK connection selected       → the user's own key, read from this browser
 *                                    and sent as a per-request header.
 *   legacy `manual` account        → retired. Historical messages still render;
 *                                    new turns are refused with a clear error.
 *
 * Both live paths hit the same same-origin proxy route, which holds all
 * provider-specific server logic. The mock adapter is retained for tests and
 * local development only and is never reachable from a production send.
 */

/** Providers with a live proxy route. */
const PROXY_ENDPOINTS: Partial<Record<ProviderSlug, string>> = {
  claude: "/api/providers/claude",
  chatgpt: "/api/providers/chatgpt",
};

/** Opt-in escape hatch for local development without any credential. */
const MOCK_ENABLED =
  process.env.NEXT_PUBLIC_UAW_ENABLE_MOCK_PROVIDERS === "true";

class RoutingAdapter implements AIProviderAdapter {
  readonly kind = "routing";
  readonly slug: ProviderSlug;
  private readonly models: ModelInfo[];
  private readonly mock: MockAdapter;
  /** Workspace: no auth header — the server supplies the credential. */
  private readonly workspace?: HttpStreamAdapter;
  /** BYOK: the user's key travels as a per-request header. */
  private readonly byok?: HttpStreamAdapter;

  constructor(entry: ProviderCatalogEntry) {
    this.slug = entry.meta.slug;
    this.models = entry.models;
    this.mock = new MockAdapter({
      slug: entry.meta.slug,
      providerName: entry.meta.name,
      models: entry.models,
    });
    const endpoint = PROXY_ENDPOINTS[entry.meta.slug];
    if (endpoint) {
      this.workspace = new HttpStreamAdapter({
        slug: entry.meta.slug,
        endpoint,
        models: entry.models,
        getAuthToken: () => null,
      });
      this.byok = new HttpStreamAdapter({
        slug: entry.meta.slug,
        endpoint,
        models: entry.models,
        getAuthToken: () => getProviderKey(this.slug),
        requireAuthToken: true,
      });
    }
  }

  async connect(): Promise<void> {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { state: "connected" };
  }

  async getModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  async sendMessage(request: ProviderMessageRequest): Promise<ProviderResponse> {
    const account = request.account;

    if (account?.legacy) {
      throw providerError(
        "UNSUPPORTED_ACTION",
        this.slug,
        "This connection used the retired manual mode. Pick Workspace or a Bring Your Own API connection to continue."
      );
    }

    if (!this.workspace || !this.byok) {
      if (MOCK_ENABLED) return this.mock.sendMessage(request);
      throw providerError(
        "UNSUPPORTED_ACTION",
        this.slug,
        "This provider is not available yet."
      );
    }

    // Workspace mode is the absence of a selected connection.
    return account ? this.byok.sendMessage(request) : this.workspace.sendMessage(request);
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
