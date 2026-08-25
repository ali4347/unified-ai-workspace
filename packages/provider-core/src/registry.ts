import type { IntegrationStatus, ProviderSlug } from "@uaw/types";
import type { AIProviderAdapter } from "./adapter";
import { providerError } from "./errors";
import { ProviderEventBus } from "./events";

/**
 * Provider registry (PRD §26): slug → { enabled, integrationStatus, adapter }.
 * The UI reads the registry; enabling/disabling providers never touches chat
 * components. Adapters register lazily via factory so construction stays
 * cheap and configurable per environment.
 */

export interface ProviderRegistration {
  slug: ProviderSlug;
  enabled: boolean;
  /** Compliance-reviewed mode (PRD §7); "disabled" until the M6 gate. The
   * mock adapter may run while the real integration is disabled. */
  integrationStatus: IntegrationStatus;
  createAdapter: () => AIProviderAdapter;
}

export class ProviderRegistry {
  readonly events = new ProviderEventBus();
  private readonly registrations = new Map<ProviderSlug, ProviderRegistration>();
  private readonly instances = new Map<ProviderSlug, AIProviderAdapter>();

  register(registration: ProviderRegistration): void {
    this.registrations.set(registration.slug, registration);
    this.instances.delete(registration.slug);
  }

  list(): ProviderRegistration[] {
    return [...this.registrations.values()];
  }

  isEnabled(slug: ProviderSlug): boolean {
    return this.registrations.get(slug)?.enabled ?? false;
  }

  getRegistration(slug: ProviderSlug): ProviderRegistration | undefined {
    return this.registrations.get(slug);
  }

  /** Returns the adapter for an enabled provider; throws a normalized
   * provider error otherwise. */
  getAdapter(slug: ProviderSlug): AIProviderAdapter {
    const registration = this.registrations.get(slug);
    if (!registration || !registration.enabled) {
      throw providerError(
        "UNSUPPORTED_ACTION",
        slug,
        `Provider "${slug}" is not enabled`
      );
    }
    let instance = this.instances.get(slug);
    if (!instance) {
      instance = registration.createAdapter();
      this.instances.set(slug, instance);
    }
    return instance;
  }
}
