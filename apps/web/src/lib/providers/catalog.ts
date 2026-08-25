import {
  PROVIDERS,
  type ModelInfo,
  type ProviderAccountInfo,
  type ProviderMeta,
  type ProviderSelection,
  type ProviderSlug,
} from "@uaw/types";
import type {
  ConnectedAccountRow,
  ModelRow,
  ProviderRow,
} from "@/lib/db/database.types";

/**
 * Provider catalog: drives the provider/model/account selectors so nothing
 * is hard-coded in UI components (PRD §15). Since Milestone 3 the catalog is
 * built from the database (providers/models reference tables + the user's
 * connected_accounts); FALLBACK_CATALOG keeps the app usable before the
 * schema migration is applied. Milestone 4 puts adapters behind it.
 */
export interface ProviderCatalogEntry {
  meta: ProviderMeta;
  /** Selectable in the UI. MVP providers only until Phase 2 (PRD §50–51). */
  enabled: boolean;
  models: ModelInfo[];
  accounts: ProviderAccountInfo[];
}

export type Catalog = readonly ProviderCatalogEntry[];

// ---------------------------------------------------------------------------
// Build from database rows
// ---------------------------------------------------------------------------

export interface CatalogData {
  providers: ProviderRow[];
  models: ModelRow[];
  accounts: ConnectedAccountRow[];
}

export function buildCatalog(data: CatalogData): Catalog {
  if (data.providers.length === 0) return FALLBACK_CATALOG;

  return [...data.providers]
    .filter((p) => p.status !== "disabled")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((provider) => ({
      meta: {
        slug: provider.slug,
        name: provider.name,
        phase: provider.status === "active" ? "mvp" : "phase2",
      },
      enabled: provider.status === "active",
      models: data.models
        .filter((m) => m.provider_id === provider.id && m.status === "active")
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({
          id: m.external_id,
          providerSlug: provider.slug,
          name: m.name,
          description: m.display_name ?? undefined,
        })),
      accounts: data.accounts
        .filter((a) => a.provider_id === provider.id)
        .map((a) => ({
          id: a.id,
          providerSlug: provider.slug,
          email: a.email ?? a.display_name ?? "Unnamed account",
          status: a.status,
        })),
    }));
}

/** Selection of a stored message/conversation (uuid columns → catalog ids). */
export function selectionFromIds(
  data: CatalogData,
  ids: {
    provider_id: string | null;
    model_id: string | null;
    account_id: string | null;
  }
): ProviderSelection | undefined {
  const provider = data.providers.find((p) => p.id === ids.provider_id);
  const model = data.models.find((m) => m.id === ids.model_id);
  if (!provider || !model) return undefined;
  return {
    providerSlug: provider.slug,
    modelId: model.external_id,
    accountId: ids.account_id,
  };
}

// ---------------------------------------------------------------------------
// Pure lookups over a catalog
// ---------------------------------------------------------------------------

export function getEntry(
  catalog: Catalog,
  slug: ProviderSlug
): ProviderCatalogEntry {
  const entry = catalog.find((e) => e.meta.slug === slug);
  if (!entry) throw new Error(`Unknown provider slug: ${slug}`);
  return entry;
}

export function getModel(
  catalog: Catalog,
  slug: ProviderSlug,
  modelId: string
): ModelInfo | undefined {
  return getEntry(catalog, slug).models.find((m) => m.id === modelId);
}

export function getAccount(
  catalog: Catalog,
  slug: ProviderSlug,
  accountId: string | null
): ProviderAccountInfo | undefined {
  if (accountId === null) return undefined;
  return getEntry(catalog, slug).accounts.find((a) => a.id === accountId);
}

/** First enabled provider with at least one model. */
export function defaultSelection(catalog: Catalog): ProviderSelection {
  const first = catalog.find((e) => e.enabled && e.models.length > 0);
  if (!first) throw new Error("Catalog has no enabled provider with models");
  return {
    providerSlug: first.meta.slug,
    modelId: first.models[0].id,
    accountId: first.accounts[0]?.id ?? null,
  };
}

/** Selection to apply when the user picks a model in the selector:
 * keeps the account if the provider is unchanged, else provider default. */
export function selectionForModel(
  catalog: Catalog,
  current: ProviderSelection,
  next: ModelInfo
): ProviderSelection {
  if (next.providerSlug === current.providerSlug) {
    return { ...current, modelId: next.id };
  }
  const entry = getEntry(catalog, next.providerSlug);
  return {
    providerSlug: next.providerSlug,
    modelId: next.id,
    accountId: entry.accounts[0]?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Static fallback (used before the M3 migration is applied to the database)
// ---------------------------------------------------------------------------

const meta = (slug: ProviderSlug): ProviderMeta => {
  const found = PROVIDERS.find((p) => p.slug === slug);
  if (!found) throw new Error(`Unknown provider slug: ${slug}`);
  return found;
};

const model = (
  providerSlug: ProviderSlug,
  id: string,
  name: string,
  description?: string
): ModelInfo => ({ id, providerSlug, name, description });

export const FALLBACK_CATALOG: Catalog = [
  {
    meta: meta("claude"),
    enabled: true,
    models: [
      model("claude", "claude-sonnet", "Sonnet", "Balanced"),
      model("claude", "claude-opus", "Opus", "Most capable"),
      model("claude", "claude-haiku", "Haiku", "Fastest"),
    ],
    accounts: [],
  },
  {
    meta: meta("chatgpt"),
    enabled: true,
    models: [
      model("chatgpt", "chatgpt-flagship", "GPT flagship", "Default"),
      model("chatgpt", "chatgpt-mini", "GPT mini", "Lightweight"),
    ],
    accounts: [],
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
