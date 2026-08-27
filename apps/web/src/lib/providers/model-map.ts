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
    // Alias of the pinned snapshot claude-haiku-4-5-20251001.
    // Retirement commitment: not sooner than 2026-10-15 — re-audit before then.
    "claude-haiku": "claude-haiku-4-5",
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

/** Fallback lookup for a provider's catalog model id. Returns null when the id
 * is unknown, which callers turn into MODEL_UNAVAILABLE. */
export function fallbackApiModel(
  provider: ProviderSlug,
  externalId: string
): string | null {
  return FALLBACK_API_MODELS[provider]?.[externalId] ?? null;
}
