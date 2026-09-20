import { supabase } from "../lib/supabase.js";
export async function getGithubRepositories(projectId) {
    const { data, error } = await supabase
        .from("github_repositories")
        .select("*")
        .eq("project_id", projectId)
        .order("connected_at", { ascending: false });
    if (error) {
        throw new Error(`Impossible de récupérer les dépôts GitHub : ${error.message}`);
    }
    return data;
}
export async function getGithubRepositoryByRemote(owner, repository) {
    const { data, error } = await supabase
        .from("github_repositories")
        .select("*")
        .eq("owner", owner)
        .eq("repository", repository)
        .maybeSingle();
    if (error) {
        throw new Error(`Impossible de rechercher le dépôt GitHub : ${error.message}`);
    }
    return data;
}
export async function connectGithubRepository(input) {
    const existing = await getGithubRepositoryByRemote(input.owner, input.repository);
    if (existing) {
        if (existing.project_id !== input.project_id) {
            throw new Error(`Le dépôt ${input.owner}/${input.repository} est déjà connecté à un autre projet.`);
        }
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
        throw new Error(`Impossible de connecter le dépôt GitHub : ${error.message}`);
    }
    return data;
}
