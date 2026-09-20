import "dotenv/config";

import { createActivity, getActivities } from "./activityService.js";
import { getGithubRepositories } from "./githubRepositoryService.js";

import type { Activity, ActivityType } from "../types/activity.js";
import type { GithubRepository } from "../types/githubRepository.js";

type GithubCommit = {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
    author?: {
      name?: string;
    } | null;
  };
};

type GithubPullRequest = {
  number: number;
  title: string;
  html_url?: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  merged_at?: string | null;
};

async function githubFetch<T>(url: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
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

function activityExists(
  projectActivities: Activity[],
  githubId: string,
): boolean {
  return projectActivities.some(
    (activity) => activity.metadata.github_id === githubId,
  );
}

export async function syncGithubRepository(
  repository: GithubRepository,
): Promise<number> {
  const existingActivities = await getActivities(repository.project_id);
  const repositoryKey = `${repository.owner}/${repository.repository}`;

  const baseUrl = `https://api.github.com/repos/${repositoryKey}`;

  const [commits, pullRequests] = await Promise.all([
    githubFetch<GithubCommit[]>(`${baseUrl}/commits?per_page=10`),
    githubFetch<GithubPullRequest[]>(
      `${baseUrl}/pulls?state=all&sort=updated&direction=desc&per_page=10`,
    ),
  ]);

  let created = 0;

  for (const commit of commits) {
    const githubId = `repo:${repositoryKey}:commit:${commit.sha}`;

    if (activityExists(existingActivities, githubId)) {
      continue;
    }

    const title =
      commit.commit.message.split("\n")[0] || "Commit sans titre";

    await createActivity({
      project_id: repository.project_id,
      type: "COMMIT",
      source: "GITHUB",
      title: `Commit : ${title}`,
      description: commit.commit.author?.name
        ? `Par ${commit.commit.author.name}`
        : undefined,
      metadata: {
        github_id: githubId,
        sha: commit.sha,
        url: commit.html_url ?? null,
        repository: repositoryKey,
      },
    });

    created += 1;
  }

  for (const pullRequest of pullRequests) {
    const isMerged = Boolean(pullRequest.merged_at);

    let type: ActivityType = "PR_UPDATED";

    if (isMerged) {
      type = "PR_MERGED";
    } else if (pullRequest.created_at === pullRequest.updated_at) {
      type = "PR_OPENED";
    }

    const eventTimestamp = isMerged
      ? pullRequest.merged_at
      : pullRequest.updated_at;

    const githubId =
      `repo:${repositoryKey}:pr:${pullRequest.number}:${eventTimestamp}`;

    if (activityExists(existingActivities, githubId)) {
      continue;
    }

    await createActivity({
      project_id: repository.project_id,
      type,
      source: "GITHUB",
      title: `PR #${pullRequest.number} : ${pullRequest.title}`,
      metadata: {
        github_id: githubId,
        number: pullRequest.number,
        url: pullRequest.html_url ?? null,
        state: pullRequest.state,
        merged_at: pullRequest.merged_at ?? null,
        repository: repositoryKey,
      },
    });

    created += 1;
  }

  return created;
}

export async function syncGithubProject(projectId: string): Promise<number> {
  const repositories = await getGithubRepositories(projectId);

  if (repositories.length === 0) {
    throw new Error("Aucun dépôt GitHub n'est connecté à ce projet.");
  }

  let created = 0;

  for (const repository of repositories) {
    created += await syncGithubRepository(repository);
  }

  return created;
}
