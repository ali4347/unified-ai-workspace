"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Project CRUD (Milestone 3, PRD §20–21). RLS enforces ownership. */

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_INSTRUCTIONS = 8_000;

export interface ProjectInput {
  name: string;
  description?: string;
  customInstructions?: string;
}

function normalize(input: ProjectInput): {
  name: string;
  description: string | null;
  custom_instructions: string | null;
} | null {
  const name = input.name.trim().slice(0, MAX_NAME);
  if (!name) return null;
  return {
    name,
    description: input.description?.trim().slice(0, MAX_DESCRIPTION) || null,
    custom_instructions:
      input.customInstructions?.trim().slice(0, MAX_INSTRUCTIONS) || null,
  };
}

export async function createProject(
  input: ProjectInput
): Promise<{ id?: string; error?: string }> {
  const fields = normalize(input);
  if (!fields) return { error: "Project name required" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, ...fields })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };

  revalidatePath("/projects");
  return { id: data.id };
}

export async function updateProject(
  id: string,
  input: ProjectInput
): Promise<{ error?: string }> {
  const fields = normalize(input);
  if (!fields) return { error: "Project name required" };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(fields).eq("id", id);
  if (!error) revalidatePath("/projects");
  return error ? { error: error.message } : {};
}

export async function deleteProject(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (!error) {
    revalidatePath("/projects");
    revalidatePath("/", "layout");
  }
  return error ? { error: error.message } : {};
}
