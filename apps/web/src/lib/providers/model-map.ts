import type { ProviderSlug } from "@uaw/types";

/**
 * Catalog model id → provider API model id.
 *
 * The database is the source of truth at runtime (`models.capabilities.api_model`,
 * set by supabase/migrations/20260825170000_refresh_provider_model_ids.sql). This
 * table is the fallback used when that migration has not been applied yet, and it
 * must stay byte-identical to the migration — `model-map.test.ts` is where that
 * agreement is asserted.
 *
 * Every id below was verified against official documentation on 2026-08-27:
 *   Anthropic — platform.claude.com/docs/en/about-claude/models/overview
 *   OpenAI    — developers.openai.com/api/docs/models (+ /deprecations)
 * Only ids documented as currently available for API use appear here. An id that
 * is absent or retired resolves to null and surfaces as a normalized
 * MODEL_UNAVAILABLE error — never a crash.
 */
export const API_MODELS_VERIFIED_ON = "2026-08-27";

export const FALLBACK_API_MODELS: Readonly<
  Partial<Record<ProviderSlug, Readonly<Record<string, string>>>>
> = {
  claude: {
    "claude-sonnet": "claude-sonnet-5",
    "claude-opus": "claude-opus-5",
    // Pinned snapshot — the documented "Claude API ID". The shorter
    // `claude-haiku-4-5` is only a convenience alias (see API_MODEL_ALIASES) and
    // is never the canonical persisted value.
    // Retirement commitment: not sooner than 2026-10-15 — re-audit before then.
    "claude-haiku": "claude-haiku-4-5-20251001",
    "claude-fable": "claude-fable-5",
  },
  chatgpt: {
    // gpt-5.6-sol also answers to the `gpt-5.6` alias; the explicit id is pinned
    // here so a future alias repoint cannot silently change behaviour.
    "chatgpt-flagship": "gpt-5.6-sol",
    "chatgpt-balanced": "gpt-5.6-terra",
    "chatgpt-mini": "gpt-5.6-luna",
  },
};

/**
 * Documented convenience aliases → the canonical pinned id they resolve to.
 *
 * Aliases are accepted on input (a database row seeded before the 2026-08-27
 * refresh migration still carries `claude-haiku-4-5`) and used for display, but
 * they are never persisted or sent as the canonical model id: pinning keeps the
 * request deterministic when an alias is later repointed at a new snapshot.
 */
export const API_MODEL_ALIASES: Readonly<Record<string, string>> = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
};

/** Normalizes any documented alias to its canonical pinned id. Unknown values
 * pass through unchanged — the provider is the final authority on validity. */
export function canonicalApiModel(apiModel: string): string {
  return API_MODEL_ALIASES[apiModel] ?? apiModel;
}

/** Provider API model ids retired upstream — must never be sent again.
 * Kept so tests can assert no code path reintroduces them. */
export const RETIRED_API_MODELS: readonly string[] = [
  // OpenAI shut the GPT-5.1 family down on 2026-07-23
  // (developers.openai.com/api/docs/deprecations).
  "gpt-5.1",
  "gpt-5.1-mini",
  "gpt-5.1-chat-latest",
  "gpt-5-chat-latest",
];

/** Fallback lookup for a provider's catalog model id, already canonical.
 * Returns null when the id is unknown, which callers turn into
 * MODEL_UNAVAILABLE. */
export function fallbackApiModel(
  provider: ProviderSlug,
  externalId: string
): string | null {
  const apiModel = FALLBACK_API_MODELS[provider]?.[externalId];
  return apiModel ? canonicalApiModel(apiModel) : null;
}
