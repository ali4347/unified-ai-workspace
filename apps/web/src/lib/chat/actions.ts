"use server";

import { revalidatePath } from "next/cache";
import type {
  MessageRole,
  MessageStatus,
  ProviderSelection,
  ProviderSlug,
} from "@uaw/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Chat mutations (Milestone 3). All writes go through the anon-key server
 * client, so RLS enforces ownership; user_id comes from the verified session.
 * Actions return { error } instead of throwing so the client can surface
 * failures without crashing the conversation UI.
 */

const MAX_TITLE = 120;
const MAX_CONTENT = 100_000;

interface SelectionIds {
  provider_id: string | null;
  model_id: string | null;
  account_id: string | null;
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function requireUser(supabase: ServerSupabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Maps catalog-level ids (slug + external model id) to database uuids.
 * Returns nulls if the reference data is missing (pre-migration fallback). */
async function resolveSelection(
  supabase: ServerSupabase,
  selection: ProviderSelection
): Promise<SelectionIds> {
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("slug", selection.providerSlug)
    .maybeSingle();
  if (!provider) {
    return { provider_id: null, model_id: null, account_id: null };
  }

  const [{ data: model }, account] = await Promise.all([
    supabase
      .from("models")
      .select("id")
      .eq("provider_id", provider.id)
      .eq("external_id", selection.modelId)
      .maybeSingle(),
    // RLS makes only the user's own accounts visible, so this also rejects
    // foreign account ids.
    selection.accountId
      ? supabase
          .from("connected_accounts")
          .select("id")
          .eq("id", selection.accountId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    provider_id: provider.id,
    model_id: model?.id ?? null,
    account_id: account.data?.id ?? null,
  };
}

export async function createConversation(input: {
  title: string;
  selection: ProviderSelection;
  projectId?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const userId = await requireUser(supabase);
  if (!userId) return { error: "Not signed in" };

  const ids = await resolveSelection(supabase, input.selection);
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title: input.title.trim().slice(0, MAX_TITLE) || "New conversation",
      project_id: input.projectId ?? null,
      active_provider_id: ids.provider_id,
      active_model_id: ids.model_id,
      active_account_id: ids.account_id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };
  revalidatePath("/", "layout");
  return { id: data.id };
}

export async function saveMessage(input: {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  selection?: ProviderSelection;
}): Promise<{ error?: string }> {
  if (input.content.length > MAX_CONTENT) {
    return { error: "Message too long" };
  }
  const supabase = await createClient();
  const userId = await requireUser(supabase);
  if (!userId) return { error: "Not signed in" };

  const ids = input.selection
    ? await resolveSelection(supabase, input.selection)
    : { provider_id: null, model_id: null, account_id: null };

  const { error } = await supabase.from("messages").insert({
    id: input.id,
    conversation_id: input.conversationId,
    user_id: userId,
    role: input.role,
    content: input.content,
    status: input.status,
    ...ids,
  });
  if (error) return { error: error.message };

  // Touch the conversation so recents order stays correct (the trigger
  // overwrites updated_at with now()); record the active selection when the
  // message carries one.
  await supabase
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
      ...(input.selection
        ? {
            active_provider_id: ids.provider_id,
            active_model_id: ids.model_id,
            active_account_id: ids.account_id,
          }
        : {}),
    })
    .eq("id", input.conversationId);

  revalidatePath("/", "layout");
  return {};
}

export async function updateConversationSelection(
  conversationId: string,
  selection: ProviderSelection
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireUser(supabase);
  if (!userId) return { error: "Not signed in" };

  const ids = await resolveSelection(supabase, selection);
  const { error } = await supabase
    .from("conversations")
    .update({
      active_provider_id: ids.provider_id,
      active_model_id: ids.model_id,
      active_account_id: ids.account_id,
    })
    .eq("id", conversationId);
  return error ? { error: error.message } : {};
}

export async function renameConversation(
  conversationId: string,
  title: string
): Promise<{ error?: string }> {
  const trimmed = title.trim().slice(0, MAX_TITLE);
  if (!trimmed) return { error: "Title required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ title: trimmed })
    .eq("id", conversationId);
  if (!error) revalidatePath("/", "layout");
  return error ? { error: error.message } : {};
}

export async function archiveConversation(
  conversationId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (!error) revalidatePath("/", "layout");
  return error ? { error: error.message } : {};
}

export async function deleteConversation(
  conversationId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);
  if (!error) revalidatePath("/", "layout");
  return error ? { error: error.message } : {};
}

/** Persists a provider event (PRD §31 provider_events, M4 event bus). */
export async function logProviderEvent(input: {
  providerSlug: ProviderSlug;
  eventType: string;
  conversationId?: string | null;
  metadata?: Record<string, string>;
}): Promise<{ error?: string }> {
  const eventType = input.eventType.slice(0, 64);
  const supabase = await createClient();
  const userId = await requireUser(supabase);
  if (!userId) return { error: "Not signed in" };

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("slug", input.providerSlug)
    .maybeSingle();

  const { error } = await supabase.from("provider_events").insert({
    user_id: userId,
    provider_id: provider?.id ?? null,
    conversation_id: input.conversationId ?? null,
    event_type: eventType,
    metadata: input.metadata ?? {},
  });
  return error ? { error: error.message } : {};
}

export interface SearchResult {
  conversations: { id: string; title: string }[];
  projects: { id: string; name: string }[];
}

/** Initial search (PRD §38): ILIKE over titles, message contents and project
 * names. Postgres text search / trigram indexes can replace this at M9. */
export async function searchWorkspace(query: string): Promise<SearchResult> {
  const q = query.trim();
  if (q.length < 2) return { conversations: [], projects: [] };
  // Escape ILIKE wildcards so user input matches literally.
  const pattern = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;

  const supabase = await createClient();
  try {
    const [byTitle, byContent, projects] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, title")
        .ilike("title", pattern)
        .is("archived_at", null)
        .limit(10),
      supabase
        .from("messages")
        .select("conversation_id")
        .ilike("content", pattern)
        .limit(20),
      supabase.from("projects").select("id, name").ilike("name", pattern).limit(5),
    ]);

    const seen = new Map<string, { id: string; title: string }>();
    for (const row of byTitle.data ?? []) seen.set(row.id, row);

    const extraIds = [
      ...new Set((byContent.data ?? []).map((r) => r.conversation_id)),
    ].filter((id) => !seen.has(id));
    if (extraIds.length > 0) {
      const { data: byId } = await supabase
        .from("conversations")
        .select("id, title")
        .in("id", extraIds)
        .is("archived_at", null);
      for (const row of byId ?? []) seen.set(row.id, row);
    }

    return {
      conversations: [...seen.values()].slice(0, 12),
      projects: projects.data ?? [],
    };
  } catch {
    return { conversations: [], projects: [] };
  }
}
