import { notFound } from "next/navigation";
import type { UiChatMessage } from "@/lib/chat/types";
import { ChatView } from "@/components/chat/chat-view";
import {
  getCatalogData,
  getConversationWithMessages,
  getProject,
} from "@/lib/db/queries";
import {
  buildCatalog,
  defaultSelection,
  selectionFromIds,
} from "@/lib/providers/catalog";

export const metadata = {
  title: "Chat",
};

/** An existing Master Conversation, reloaded from Supabase (PRD §56). */
export default async function ConversationPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const [data, result] = await Promise.all([
    getCatalogData(),
    getConversationWithMessages(id),
  ]);
  if (!result) notFound();

  const { conversation, messages } = result;
  const catalog = buildCatalog(data);
  const project = conversation.project_id
    ? await getProject(conversation.project_id)
    : null;

  const initialMessages: UiChatMessage[] = messages.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as { integration?: unknown })
        : {};
    const integration = metadata.integration;
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      status: row.status,
      selection: selectionFromIds(data, row),
      integration:
        integration === "mock" ||
        integration === "manual" ||
        integration === "official_api"
          ? integration
          : undefined,
      createdAt: Date.parse(row.created_at),
    };
  });

  const initialSelection =
    selectionFromIds(data, {
      provider_id: conversation.active_provider_id,
      model_id: conversation.active_model_id,
      account_id: conversation.active_account_id,
    }) ?? defaultSelection(catalog);

  return (
    <ChatView
      // Force a remount when navigating between conversations — otherwise
      // React reuses the instance and keeps the previous chat's state.
      key={conversation.id}
      catalog={catalog}
      initialSelection={initialSelection}
      conversationId={conversation.id}
      initialMessages={initialMessages}
      projectId={project?.id}
      projectName={project?.name}
      projectInstructions={project?.custom_instructions}
    />
  );
}
