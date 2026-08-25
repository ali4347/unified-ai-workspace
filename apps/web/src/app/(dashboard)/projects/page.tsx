import { getProjects } from "@/lib/db/queries";
import { ProjectManager } from "@/components/projects/project-manager";

export const metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
      <ProjectManager projects={projects} />
    </div>
  );
}
