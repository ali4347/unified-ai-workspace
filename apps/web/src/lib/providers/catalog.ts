import {
  PROVIDERS,
  type ModelInfo,
  type ProviderAccountInfo,
  type ProviderMeta,
  type ProviderSelection,
  type ProviderSlug,
} from "@uaw/types";

/**
 * Mock provider catalog (Milestone 2). Drives the provider/model/account
 * selectors so no models are hard-coded in UI components (PRD §15).
 * Milestone 3 replaces this with the `providers`/`models`/`connected_accounts`
 * tables; Milestone 4 wires it into the provider registry. Accounts here are
 * fake sample data — no real provider connection exists yet.
 */
export interface ProviderCatalogEntry {
  meta: ProviderMeta;
  /** Selectable in the UI. MVP providers only (PRD §50–51). */
  enabled: boolean;
  models: ModelInfo[];
  accounts: ProviderAccountInfo[];
}

const model = (
  providerSlug: ProviderSlug,
  id: string,
  name: string,
  description?: string
): ModelInfo => ({ id, providerSlug, name, description });

const account = (
  providerSlug: ProviderSlug,
  id: string,
  email: string
): ProviderAccountInfo => ({ id, providerSlug, email, status: "connected" });

const meta = (slug: ProviderSlug): ProviderMeta => {
  const found = PROVIDERS.find((p) => p.slug === slug);
  if (!found) throw new Error(`Unknown provider slug: ${slug}`);
  return found;
};

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    meta: meta("claude"),
    enabled: true,
    models: [
      model("claude", "claude-sonnet", "Sonnet", "Balanced (mock)"),
      model("claude", "claude-opus", "Opus", "Most capable (mock)"),
      model("claude", "claude-haiku", "Haiku", "Fastest (mock)"),
    ],
    accounts: [
      account("claude", "claude-acc-1", "ali@gmail.com"),
      account("claude", "claude-acc-2", "work@gmail.com"),
    ],
  },
  {
    meta: meta("chatgpt"),
    enabled: true,
    models: [
      model("chatgpt", "chatgpt-flagship", "GPT flagship", "Default (mock)"),
      model("chatgpt", "chatgpt-mini", "GPT mini", "Lightweight (mock)"),
    ],
    accounts: [account("chatgpt", "chatgpt-acc-1", "khan@gmail.com")],
  },
  {
    meta: meta("gemini"),
    enabled: false,
    models: [
      model("gemini", "gemini-pro", "Pro"),
      model("gemini", "gemini-flash", "Flash"),
    ],
    accounts: [],
  },
  {
    meta: meta("perplexity"),
    enabled: false,
    models: [model("perplexity", "perplexity-default", "Default")],
    accounts: [],
  },
  {
    meta: meta("copilot"),
    enabled: false,
    models: [model("copilot", "copilot-default", "Default")],
    accounts: [],
  },
];

export function getCatalogEntry(slug: ProviderSlug): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((e) => e.meta.slug === slug);
  if (!entry) throw new Error(`Unknown provider slug: ${slug}`);
  return entry;
}

export function getModel(slug: ProviderSlug, modelId: string): ModelInfo {
  const found = getCatalogEntry(slug).models.find((m) => m.id === modelId);
  if (!found) throw new Error(`Unknown model ${modelId} for ${slug}`);
  return found;
}

export function getAccount(
  slug: ProviderSlug,
  accountId: string
): ProviderAccountInfo | undefined {
  return getCatalogEntry(slug).accounts.find((a) => a.id === accountId);
}

/** First enabled provider, its first model and first account. */
export const DEFAULT_SELECTION: ProviderSelection = (() => {
  const first = PROVIDER_CATALOG.find((e) => e.enabled);
  if (!first || first.models.length === 0 || first.accounts.length === 0) {
    throw new Error("Mock catalog needs one enabled provider with data");
  }
  return {
    providerSlug: first.meta.slug,
    modelId: first.models[0].id,
    accountId: first.accounts[0].id,
  };
})();

/** Selection to apply when the user picks a model in the selector:
 * keeps the account if the provider is unchanged, else provider default. */
export function selectionForModel(
  current: ProviderSelection,
  next: ModelInfo
): ProviderSelection {
  if (next.providerSlug === current.providerSlug) {
    return { ...current, modelId: next.id };
  }
  const entry = getCatalogEntry(next.providerSlug);
  return {
    providerSlug: next.providerSlug,
    modelId: next.id,
    accountId: entry.accounts[0]?.id ?? "",
  };
}
