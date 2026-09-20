import { supabase } from "../lib/supabase.js";
import type {
  CreateGithubRepositoryInput,
  GithubRepository,
} from "../types/githubRepository.js";

export async function getGithubRepositories(
  projectId: string,
): Promise<GithubRepository[]> {
  const { data, error } = await supabase
    .from("github_repositories")
    .select("*")
    .eq("project_id", projectId)
    .order("connected_at", { ascending: false });

  if (error) {
    throw new Error(
      `Impossible de récupérer les dépôts GitHub : ${error.message}`,
    );
  }

  return data;
}

export async function connectGithubRepository(
  input: CreateGithubRepositoryInput,
): Promise<GithubRepository> {
  const { data: existing } = await supabase
    .from("github_repositories")
    .select("*")
    .eq("project_id", input.project_id)
    .eq("owner", input.owner)
    .eq("repository", input.repository)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("github_repositories")
    .insert({
      project_id: input.project_id,
      owner: input.owner,
      repository: input.repository,
      url: input.url,
      default_branch: input.default_branch ?? "main",
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Impossible de connecter le dépôt GitHub : ${error.message}`,
    );
  }

  return data;
}
