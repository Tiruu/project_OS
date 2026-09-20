import "dotenv/config";

import { supabase } from "../lib/supabase.js";

import type { GithubDiscoveredRepository } from "../types/githubDiscovery.js";

type GithubSearchResponse = {
  items: Array<{
    name: string;
    full_name: string;
    html_url: string;
    description: string | null;
    language: string | null;
    visibility?: string;
    default_branch?: string;
    owner: {
      login: string;
    };
  }>;
};

async function githubFetch<T>(url: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Project-OS",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status} : ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

async function getImportedRepositories(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("github_repositories")
    .select("owner, repository");

  if (error) {
    throw new Error(
      `Impossible de récupérer les dépôts déjà importés : ${error.message}`,
    );
  }

  return new Set(
    data.map(
      (repository) =>
        `${repository.owner}/${repository.repository}`.toLowerCase(),
    ),
  );
}

export async function discoverGithubRepositories(
  owner: string,
): Promise<GithubDiscoveredRepository[]> {
  const importedRepositories = await getImportedRepositories();

  const query = encodeURIComponent(`user:${owner}`);
  const result = await githubFetch<GithubSearchResponse>(
    `https://api.github.com/search/repositories?q=${query}&sort=updated&order=desc&per_page=100`,
  );

  return result.items.map((repository) => ({
    owner: repository.owner.login,
    name: repository.name,
    full_name: repository.full_name,
    url: repository.html_url,
    description: repository.description,
    language: repository.language,
    visibility: repository.visibility ?? "unknown",
    default_branch: repository.default_branch ?? "main",
    alreadyImported: importedRepositories.has(
      repository.full_name.toLowerCase(),
    ),
  }));
}
