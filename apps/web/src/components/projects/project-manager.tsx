"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";
import type { ProjectRow } from "@/lib/db/database.types";
import {
  createProject,
  deleteProject,
  updateProject,
  type ProjectInput,
} from "@/lib/projects/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Project CRUD UI (PRD §20–21). */
export function ProjectManager({
  projects,
}: Readonly<{ projects: ProjectRow[] }>) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New project
          </Button>
        )}
      </div>

      {creating && (
        <ProjectForm
          heading="New project"
          submitLabel="Create project"
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            const result = await createProject(input);
            if (!result.error) {
              setCreating(false);
              router.refresh();
            }
            return result.error;
          }}
        />
      )}

      {projects.length === 0 && !creating ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Projects group conversations and carry custom instructions that
              are handed to the AI provider with each conversation.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))
      )}
    </div>
  );
}

function ProjectCard({ project }: Readonly<{ project: ProjectRow }>) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);

  if (editing) {
    return (
      <ProjectForm
        heading={`Edit ${project.name}`}
        submitLabel="Save changes"
        initial={{
          name: project.name,
          description: project.description ?? "",
          customInstructions: project.custom_instructions ?? "",
        }}
        onCancel={() => setEditing(false)}
        onSubmit={async (input) => {
          const result = await updateProject(project.id, input);
          if (!result.error) {
            setEditing(false);
            router.refresh();
          }
          return result.error;
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate">{project.name}</CardTitle>
            {project.description && (
              <CardDescription>{project.description}</CardDescription>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${project.name}`}
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${project.name}`}
              className="hover:text-destructive"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete project "${project.name}"? Its conversations stay, unassigned.`
                  )
                ) {
                  return;
                }
                await deleteProject(project.id);
                router.refresh();
              }}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Link
          href={`/chat?project=${project.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <MessageSquarePlus className="size-4" />
          New chat in project
        </Link>
        {project.custom_instructions && (
          <p className="w-full text-xs text-muted-foreground">
            Instructions: {project.custom_instructions.slice(0, 200)}
            {project.custom_instructions.length > 200 && "…"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectForm({
  heading,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: Readonly<{
  heading: string;
  submitLabel: string;
  initial?: ProjectInput;
  onSubmit: (input: ProjectInput) => Promise<string | undefined>;
  onCancel: () => void;
}>) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(
    initial?.description ?? ""
  );
  const [instructions, setInstructions] = React.useState(
    initial?.customInstructions ?? ""
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const failure = await onSubmit({
              name,
              description,
              customInstructions: instructions,
            });
            setBusy(false);
            if (failure) setError(failure);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${heading}-name`}>Name</Label>
            <Input
              id={`${heading}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="RiverLink"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${heading}-description`}>Description</Label>
            <Input
              id={`${heading}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${heading}-instructions`}>
              Custom instructions
            </Label>
            <textarea
              id={`${heading}-instructions`}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder={
                "Included in the context handed to providers.\ne.g. Always generate TypeScript."
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {submitLabel}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
