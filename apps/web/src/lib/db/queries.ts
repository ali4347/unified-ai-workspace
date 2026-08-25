import { createClient } from "@/lib/supabase/server";
import type { CatalogData } from "@/lib/providers/catalog";
import type {
  ConversationRow,
  MessageRow,
  ProjectRow,
} from "@/lib/db/database.types";

/**
 * Server-side read queries (RSC only). All user-owned reads run through the
 * anon-key client, so RLS is the access control — never the service role.
 * Reads degrade to empty results if the M3 migration is not applied yet
 * (same principle as the env setup notice: degrade, never crash).
 */

export async function getCatalogData(): Promise<CatalogData> {
  const supabase = await createClient();
  try {
    const [providers, models, accounts] = await Promise.all([
      supabase.from("providers").select("*"),
      supabase.from("models").select("*"),
      supabase.from("connected_accounts").select("*"),
    ]);
    return {
      providers: providers.data ?? [],
      models: models.data ?? [],
      accounts: accounts.data ?? [],
    };
  } catch {
    return { providers: [], models: [], accounts: [] };
  }
}

export interface ConversationListItem {
  id: string;
  title: string;
  project_id: string | null;
  updated_at: string;
}

export async function getRecentConversations(
  limit = 30
): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  try {
    const { data } = await supabase
      .from("conversations")
      .select("id, title, project_id, updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getConversationWithMessages(id: string): Promise<{
  conversation: ConversationRow;
  messages: MessageRow[];
} | null> {
  const supabase = await createClient();
  try {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!conversation) return null;

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    return { conversation, messages: messages ?? [] };
  } catch {
    return null;
  }
}

export async function getProjects(): Promise<ProjectRow[]> {
  const supabase = await createClient();
  try {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const supabase = await createClient();
  try {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}
