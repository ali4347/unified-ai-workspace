import { ChatView } from "@/components/chat/chat-view";
import { getCatalogData, getProject } from "@/lib/db/queries";
import { buildCatalog, defaultSelection } from "@/lib/providers/catalog";

export const metadata = {
  title: "Chat",
};

/** New Master Conversation. `?project=<id>` starts the chat inside a project. */
export default async function ChatPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ project?: string }> }>) {
  const { project: projectId } = await searchParams;
  const [data, project] = await Promise.all([
    getCatalogData(),
    projectId ? getProject(projectId) : Promise.resolve(null),
  ]);
  const catalog = buildCatalog(data);

  return (
    <ChatView
      catalog={catalog}
      initialSelection={defaultSelection(catalog)}
      projectId={project?.id}
      projectName={project?.name}
    />
  );
}
