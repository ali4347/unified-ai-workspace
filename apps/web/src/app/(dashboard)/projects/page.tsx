import { FolderKanban } from "lucide-react";

export const metadata = {
  title: "Projects",
};

export default function ProjectsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-10 text-center">
      <FolderKanban className="size-8 text-muted-foreground" />
      <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Organize conversations into projects with custom instructions and a
        default provider. Project CRUD ships with Milestone 3 (Database).
      </p>
    </div>
  );
}
