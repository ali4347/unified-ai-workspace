import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProviderSlug } from "@uaw/types";
import {
  API_MODELS_VERIFIED_ON,
  FALLBACK_API_MODELS,
  RETIRED_API_MODELS,
  fallbackApiModel,
} from "@/lib/providers/model-map";
import { FALLBACK_CATALOG, getEntry } from "@/lib/providers/catalog";

const MIGRATION = fileURLToPath(
  new URL(
    "../../../../../supabase/migrations/20260825170000_refresh_provider_model_ids.sql",
    import.meta.url
  )
);

/** Parses the api_model VALUES block (section 3) of the refresh migration. */
function migrationMapping(): Record<string, Record<string, string>> {
  const sql = readFileSync(MIGRATION, "utf8");
  const section = sql.slice(sql.indexOf("-- 3."), sql.indexOf("-- 4."));
  expect(section).toContain("'api_model', v.api_model");

  const mapping: Record<string, Record<string, string>> = {};
  for (const [, provider, externalId, apiModel] of section.matchAll(
    /\('([a-z]+)',\s*'([a-z0-9-]+)',\s*'([^']+)'\)/g
  )) {
    mapping[provider] ??= {};
    mapping[provider][externalId] = apiModel;
  }
  return mapping;
}

describe("model map ↔ migration", () => {
  it("matches the api_model values in the refresh migration exactly", () => {
    const fromSql = migrationMapping();
    expect(Object.keys(fromSql).sort()).toEqual(["chatgpt", "claude"]);
    for (const [provider, models] of Object.entries(fromSql)) {
      expect(FALLBACK_API_MODELS[provider as ProviderSlug]).toEqual(models);
    }
  });

  it("stamps the same verification date as the migration", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain(`'api_model_verified_on', '${API_MODELS_VERIFIED_ON}'`);
  });
});

describe("model map ↔ fallback catalog", () => {
  it("maps every model the static catalog offers for proxied providers", () => {
    for (const provider of ["claude", "chatgpt"] as const) {
      const catalogIds = getEntry(FALLBACK_CATALOG, provider).models.map(
        (m) => m.id
      );
      expect(catalogIds.length).toBeGreaterThan(0);
      for (const id of catalogIds) {
        expect(fallbackApiModel(provider, id)).toBeTruthy();
      }
      // No orphan mappings pointing at models the catalog no longer offers.
      expect(Object.keys(FALLBACK_API_MODELS[provider] ?? {}).sort()).toEqual(
        [...catalogIds].sort()
      );
    }
  });
});

describe("retired ids", () => {
  it("are absent from every mapping", () => {
    const inUse = Object.values(FALLBACK_API_MODELS).flatMap((models) =>
      Object.values(models ?? {})
    );
    for (const retired of RETIRED_API_MODELS) {
      expect(inUse).not.toContain(retired);
    }
  });

  it("no longer includes the GPT-5.1 family shut down on 2026-07-23", () => {
    expect(RETIRED_API_MODELS).toContain("gpt-5.1");
    expect(RETIRED_API_MODELS).toContain("gpt-5.1-mini");
    expect(fallbackApiModel("chatgpt", "chatgpt-flagship")).toBe("gpt-5.6-sol");
    expect(fallbackApiModel("chatgpt", "chatgpt-mini")).toBe("gpt-5.6-luna");
  });
});

describe("fallbackApiModel", () => {
  it("resolves documented ids", () => {
    expect(fallbackApiModel("claude", "claude-opus")).toBe("claude-opus-5");
    expect(fallbackApiModel("claude", "claude-fable")).toBe("claude-fable-5");
  });

  it("returns null for unknown ids so callers emit MODEL_UNAVAILABLE", () => {
    expect(fallbackApiModel("claude", "claude-does-not-exist")).toBeNull();
    // A provider with no proxy route has no mapping at all.
    expect(fallbackApiModel("gemini", "gemini-pro")).toBeNull();
  });
});
