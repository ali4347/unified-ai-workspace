import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  defaultSelection,
  FALLBACK_CATALOG,
  getEntry,
  selectionForModel,
  selectionFromIds,
  type CatalogData,
} from "@/lib/providers/catalog";
import type {
  ConnectedAccountRow,
  ModelRow,
  ProviderRow,
} from "@/lib/db/database.types";

const providers: ProviderRow[] = [
  {
    id: "p-claude",
    slug: "claude",
    name: "Claude",
    icon_url: null,
    integration_type: "manual",
    status: "active",
    sort_order: 1,
    created_at: "",
  },
  {
    id: "p-gemini",
    slug: "gemini",
    name: "Google Gemini",
    icon_url: null,
    integration_type: "disabled",
    status: "phase2",
    sort_order: 3,
    created_at: "",
  },
];

const models: ModelRow[] = [
  {
    id: "m-sonnet",
    provider_id: "p-claude",
    external_id: "claude-sonnet",
    name: "Sonnet",
    display_name: "Balanced",
    capabilities: {},
    status: "active",
    sort_order: 1,
    created_at: "",
    updated_at: "",
  },
  {
    id: "m-old",
    provider_id: "p-claude",
    external_id: "claude-old",
    name: "Old",
    display_name: null,
    capabilities: {},
    status: "disabled",
    sort_order: 2,
    created_at: "",
    updated_at: "",
  },
];

const accounts: ConnectedAccountRow[] = [
  {
    id: "a-1",
    user_id: "u-1",
    provider_id: "p-claude",
    email: "ali@example.com",
    display_name: null,
    subscription_label: null,
    status: "connected",
    metadata: { mode: "manual" },
    last_connected_at: null,
    last_used_at: null,
    created_at: "",
    updated_at: "",
  },
];

const data: CatalogData = { providers, models, accounts };

describe("buildCatalog", () => {
  it("returns the static fallback when no providers exist", () => {
    expect(
      buildCatalog({ providers: [], models: [], accounts: [] })
    ).toBe(FALLBACK_CATALOG);
  });

  it("maps rows, filters disabled models, reads account mode", () => {
    const catalog = buildCatalog(data);
    const claude = getEntry(catalog, "claude");
    expect(claude.enabled).toBe(true);
    expect(claude.models.map((m) => m.id)).toEqual(["claude-sonnet"]);
    expect(claude.accounts[0]).toMatchObject({
      id: "a-1",
      email: "ali@example.com",
      integrationMode: "manual",
    });
    expect(getEntry(catalog, "gemini").enabled).toBe(false);
  });
});

describe("defaultSelection / selectionForModel", () => {
  const catalog = buildCatalog(data);

  it("picks the first enabled provider with its first model and account", () => {
    expect(defaultSelection(catalog)).toEqual({
      providerSlug: "claude",
      modelId: "claude-sonnet",
      accountId: "a-1",
    });
  });

  it("keeps the account when switching models within a provider", () => {
    const current = defaultSelection(catalog);
    const next = selectionForModel(catalog, current, {
      id: "claude-sonnet",
      providerSlug: "claude",
      name: "Sonnet",
    });
    expect(next.accountId).toBe("a-1");
  });

  it("resets the account when switching providers", () => {
    const current = defaultSelection(catalog);
    const next = selectionForModel(catalog, current, {
      id: "gemini-pro",
      providerSlug: "gemini",
      name: "Pro",
    });
    expect(next).toEqual({
      providerSlug: "gemini",
      modelId: "gemini-pro",
      accountId: null,
    });
  });
});

describe("selectionFromIds", () => {
  it("maps stored uuids back to catalog ids", () => {
    expect(
      selectionFromIds(data, {
        provider_id: "p-claude",
        model_id: "m-sonnet",
        account_id: "a-1",
      })
    ).toEqual({
      providerSlug: "claude",
      modelId: "claude-sonnet",
      accountId: "a-1",
    });
  });

  it("returns undefined for unknown ids", () => {
    expect(
      selectionFromIds(data, {
        provider_id: "nope",
        model_id: "m-sonnet",
        account_id: null,
      })
    ).toBeUndefined();
  });
});
