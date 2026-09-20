import { supabase } from "../lib/supabase.js";
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "../types/project.js";

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de récupérer les projets : ${error.message}`);
  }

  return data;
}

export async function getProject(projectId: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) {
    throw new Error(`Impossible de récupérer le projet : ${error.message}`);
  }

  return data;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: input.name,
      type: input.type,
      technologies: input.technologies,
      purpose: input.purpose,
      description: input.description,
      current_state: input.current_state,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Impossible de créer le projet : ${error.message}`);
  }

  return data;
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update(input)
    .eq("id", projectId)
    .select()
    .single();

  if (error) {
    throw new Error(`Impossible de mettre à jour le projet : ${error.message}`);
  }

  return data;
}

export async function getProjectByName(name: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("name", name)
    .single();

  if (error) {
    throw new Error(
      `Impossible de trouver le projet "${name}" : ${error.message}`,
    );
  }

  return data;
}