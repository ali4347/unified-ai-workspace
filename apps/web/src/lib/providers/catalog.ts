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
import { modelPolicy } from "@/lib/providers/model-map";

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
        .map((m) => {
          const policy = modelPolicy(provider.slug, m.external_id);
          return {
            id: m.external_id,
            providerSlug: provider.slug,
            name: m.name,
            description: m.display_name ?? undefined,
            availability: policy.availability,
            enabled: policy.enabled,
            tier: policy.tier,
          };
        })
        .filter((m) => m.enabled),
      accounts: data.accounts
        .filter((a) => a.provider_id === provider.id)
        .map((a) => {
          const metadata =
            a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata)
              ? a.metadata
              : {};
          const mode = (metadata as { mode?: unknown }).mode;
          const integrationMode =
            mode === "manual" || mode === "official_api" ? mode : undefined;
          return {
            id: a.id,
            providerSlug: provider.slug,
            email: a.email ?? a.display_name ?? "Unnamed account",
            status: a.status,
            integrationMode,
            // `official_api` rows are Bring-Your-Own-API connections. `manual`
            // is retired: kept readable, never selectable for new turns.
            connectionMode:
              integrationMode === "manual" ? undefined : ("byok" as const),
            legacy: integrationMode === "manual",
          };
        }),
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

/** BYOK connections a user may actually select. Retired `manual` records are
 * excluded so they cannot be chosen for a new turn, while remaining in the
 * catalog for rendering historical messages. */
export function selectableAccounts(
  catalog: Catalog,
  slug: ProviderSlug
): ProviderAccountInfo[] {
  return getEntry(catalog, slug).accounts.filter((a) => !a.legacy);
}

export function getAccount(
  catalog: Catalog,
  slug: ProviderSlug,
  accountId: string | null
): ProviderAccountInfo | undefined {
  if (accountId === null) return undefined;
  return getEntry(catalog, slug).accounts.find((a) => a.id === accountId);
}

/** Default selection for a new conversation: the first workspace-capable model
 * of the first enabled provider, in Workspace mode (accountId null) so a signed
 * in user can chat immediately without connecting anything. */
export function defaultSelection(catalog: Catalog): ProviderSelection {
  for (const entry of catalog) {
    if (!entry.enabled) continue;
    const workspaceModel = entry.models.find(
      (m) => m.availability === "workspace" || m.availability === "both"
    );
    if (workspaceModel) {
      return {
        providerSlug: entry.meta.slug,
        modelId: workspaceModel.id,
        accountId: null,
      };
    }
  }
  const first = catalog.find((e) => e.enabled && e.models.length > 0);
  if (!first) throw new Error("Catalog has no enabled provider with models");
  return {
    providerSlug: first.meta.slug,
    modelId: first.models[0].id,
    accountId: null,
  };
}

/** Selection to apply when the user picks a model in the selector:
 * keeps the account if the provider is unchanged, else provider default. */
export function selectionForModel(
  catalog: Catalog,
  current: ProviderSelection,
  next: ModelInfo
): ProviderSelection {
  const availability = next.availability ?? "both";
  const sameProvider = next.providerSlug === current.providerSlug;
  // Keep the current connection where it is valid for the target model,
  // otherwise fall back to whichever mode the model does support.
  if (sameProvider && current.accountId !== null && availability !== "workspace") {
    return { ...current, modelId: next.id };
  }
  if (availability === "byok") {
    const account = selectableAccounts(catalog, next.providerSlug)[0];
    return {
      providerSlug: next.providerSlug,
      modelId: next.id,
      accountId: account?.id ?? null,
    };
  }
  return { providerSlug: next.providerSlug, modelId: next.id, accountId: null };
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
): ModelInfo => {
  const policy = modelPolicy(providerSlug, id);
  return {
    id,
    providerSlug,
    name,
    description,
    availability: policy.availability,
    enabled: policy.enabled,
    tier: policy.tier,
  };
};

export const FALLBACK_CATALOG: Catalog = [
  {
    meta: meta("claude"),
    enabled: true,
    // Order and labels mirror supabase/migrations/20260825170000_refresh_provider_model_ids.sql.
    models: [
      model("claude", "claude-sonnet", "Sonnet", "Balanced"),
      model("claude", "claude-opus", "Opus", "Complex agentic work"),
      model("claude", "claude-fable", "Fable", "Highest capability"),
      model("claude", "claude-haiku", "Haiku", "Fastest"),
    ],
    accounts: [],
  },
  {
    meta: meta("chatgpt"),
    enabled: true,
    models: [
      model("chatgpt", "chatgpt-flagship", "GPT flagship", "Frontier"),
      model("chatgpt", "chatgpt-balanced", "GPT balanced", "Balanced cost"),
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
