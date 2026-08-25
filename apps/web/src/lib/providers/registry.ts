import { MockAdapter, ProviderRegistry } from "@uaw/provider-core";
import type { Catalog } from "@/lib/providers/catalog";

/**
 * Builds the provider registry (PRD §26) for the current catalog. Every
 * enabled provider currently runs on the mock adapter; the Milestone 6
 * compliance gate swaps in real integration modes (manual / official_api)
 * per provider without touching chat components.
 */
export function createRegistryFromCatalog(catalog: Catalog): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const entry of catalog) {
    registry.register({
      slug: entry.meta.slug,
      enabled: entry.enabled,
      integrationStatus: "disabled",
      createAdapter: () =>
        new MockAdapter({
          slug: entry.meta.slug,
          providerName: entry.meta.name,
          models: entry.models,
        }),
    });
  }
  return registry;
}
