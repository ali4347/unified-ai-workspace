"use server";

import { revalidatePath } from "next/cache";
import type { IntegrationMode, ProviderSlug } from "@uaw/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Connected-account CRUD (M6). Rows are METADATA ONLY (PRD §19): provider,
 * label/email, integration mode, status. API keys never reach the server —
 * they stay in the user's browser (see lib/providers/key-store.ts).
 */

const MAX_LABEL = 120;

/**
 * Records a Bring-Your-Own-API connection. METADATA ONLY: the row stores the
 * provider, a user-chosen label and the mode — never the API key, which stays
 * in the user's browser (see lib/providers/key-store.ts).
 *
 * The persisted mode value stays `official_api` for backward compatibility
 * with existing rows; the product surface calls it "Bring Your Own API".
 * `manual` is retired and can no longer be created.
 */
export async function connectAccount(input: {
  providerSlug: ProviderSlug;
  email?: string;
}): Promise<{ id?: string; error?: string }> {
  const mode: IntegrationMode = "official_api";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: provider } = await supabase
    .from("providers")
    .select("id, integration_type")
    .eq("slug", input.providerSlug)
    .maybeSingle();
  if (!provider) return { error: "Unknown provider" };
  if (provider.integration_type === "disabled") {
    return {
      error:
        "This provider has no approved integration mode yet (compliance gate).",
    };
  }

  const email = input.email?.trim().slice(0, MAX_LABEL) || null;
  const { data, error } = await supabase
    .from("connected_accounts")
    .insert({
      user_id: user.id,
      provider_id: provider.id,
      email,
      status: "connected",
      metadata: { mode },
      last_connected_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };

  revalidatePath("/", "layout");
  return { id: data.id };
}

export async function disconnectAccount(
  accountId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("id", accountId);
  if (!error) revalidatePath("/", "layout");
  return error ? { error: error.message } : {};
}
