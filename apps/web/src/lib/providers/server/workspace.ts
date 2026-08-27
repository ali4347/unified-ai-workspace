import type { ProviderSlug } from "@uaw/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace Models: server-held provider credentials plus the usage control
 * that protects the app owner's budget.
 *
 * The credential is read from a server-only environment variable and never
 * leaves this process — it is not in the client bundle, not in localStorage,
 * not in Supabase, and never logged. `NEXT_PUBLIC_*` is deliberately not used
 * (a `NEXT_PUBLIC_` provider key would ship to every browser).
 */

/** Server-only env var per provider. Never prefix these with NEXT_PUBLIC_. */
const WORKSPACE_KEY_ENV: Record<ProviderSlug, string> = {
  claude: "ANTHROPIC_API_KEY",
  chatgpt: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  copilot: "COPILOT_API_KEY",
};

/** The workspace credential for a provider, or null when unconfigured. */
export function workspaceApiKey(provider: ProviderSlug): string | null {
  const value = process.env[WORKSPACE_KEY_ENV[provider]];
  return value && value.trim().length > 0 ? value : null;
}

/** True when the deployment can serve this provider in Workspace mode. */
export function isWorkspaceConfigured(provider: ProviderSlug): boolean {
  return workspaceApiKey(provider) !== null;
}

// ---------------------------------------------------------------------------
// Usage control (workspace mode only — BYOK spends the user's own quota)
// ---------------------------------------------------------------------------

/** Requests per user per UTC day against workspace credentials. */
export const WORKSPACE_DAILY_REQUEST_LIMIT = (() => {
  const raw = Number.parseInt(
    process.env.WORKSPACE_DAILY_REQUEST_LIMIT ?? "",
    10
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
})();

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** True when the quota table/function is absent (migration not applied). */
  degraded: boolean;
}

/**
 * Atomically counts one workspace request against the caller's daily quota.
 *
 * Enforcement is server-side and tamper-resistant by construction: the counter
 * lives in a table with no user INSERT/UPDATE/DELETE policy, and is written
 * only by the `security definer` function below, which derives the user from
 * `auth.uid()` rather than trusting anything the client sends. A user cannot
 * decrement, delete, or forge their own usage.
 *
 * If the migration has not been applied yet the function is missing; we allow
 * the request and flag `degraded` so the caller can log it. Failing closed
 * would take chat down on a deployment that simply has not migrated yet.
 */
export async function consumeWorkspaceQuota(): Promise<QuotaResult> {
  const limit = WORKSPACE_DAILY_REQUEST_LIMIT;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("consume_workspace_quota", {
      p_daily_limit: limit,
    });
    if (error) {
      // 42883 = undefined_function → migration not applied yet.
      const missing =
        error.code === "42883" || /does not exist/i.test(error.message ?? "");
      if (missing) return { allowed: true, used: 0, limit, degraded: true };
      // Any other database error fails closed: better to refuse a request than
      // to serve unmetered spend on the owner's credential.
      return { allowed: false, used: 0, limit, degraded: false };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      used: Number(row?.used ?? 0),
      limit: Number(row?.daily_limit ?? limit),
      degraded: false,
    };
  } catch {
    return { allowed: false, used: 0, limit, degraded: false };
  }
}
