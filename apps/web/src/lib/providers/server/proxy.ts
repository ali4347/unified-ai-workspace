import { NextResponse } from "next/server";
import type { ProviderErrorCode, ProviderSlug } from "@uaw/types";
import { canonicalApiModel } from "@/lib/providers/model-map";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared plumbing for provider proxy routes (the server half of
 * `official_api` adapters). Hard rules (PRD §19, §48, docs/SECURITY.md):
 * the user-supplied key is forwarded to the provider and NEVER stored,
 * logged, or echoed back. Pure validation/rate-limit helpers live in
 * ./validation (unit-tested).
 */

export {
  MAX_KEY_LENGTH,
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
  checkRateLimit,
  readProviderKey,
  validateChatBody,
  type ProxyChatMessage,
  type ProxyRequestBody,
} from "@/lib/providers/server/validation";

export function errorResponse(
  status: number,
  code: ProviderErrorCode,
  message: string
): NextResponse {
  return NextResponse.json({ code, message }, { status });
}

/** Requires a signed-in portal user (the proxy must never be an open relay). */
export async function requirePortalUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Resolves a catalog model id to the provider's real API model id via
 * models.capabilities.api_model (seeded by migration). The result is
 * normalized through canonicalApiModel, so a row still carrying a documented
 * alias (e.g. a database seeded before the 2026-08-27 refresh migration)
 * resolves to the pinned snapshot rather than the alias. */
export async function resolveApiModel(
  providerSlug: ProviderSlug,
  externalId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("slug", providerSlug)
    .maybeSingle();
  if (!provider) return null;

  const { data: model } = await supabase
    .from("models")
    .select("capabilities")
    .eq("provider_id", provider.id)
    .eq("external_id", externalId)
    .maybeSingle();
  const capabilities = model?.capabilities;
  if (
    capabilities &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities)
  ) {
    const apiModel = (capabilities as { api_model?: unknown }).api_model;
    if (typeof apiModel === "string" && apiModel.length > 0) {
      return canonicalApiModel(apiModel);
    }
  }
  return null;
}
