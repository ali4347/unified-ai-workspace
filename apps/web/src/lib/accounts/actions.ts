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

export async function connectAccount(input: {
  providerSlug: ProviderSlug;
  mode: IntegrationMode;
  email?: string;
}): Promise<{ id?: string; error?: string }> {
  if (input.mode !== "manual" && input.mode !== "official_api") {
    return { error: "Unsupported integration mode" };
  }

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
      metadata: { mode: input.mode },
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
