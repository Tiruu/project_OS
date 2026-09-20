import "dotenv/config";
import { createActivity, getActivities } from "./activityService.js";
import { getGithubRepositories } from "./githubRepositoryService.js";
async function githubFetch(url) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Project-OS",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        const acceptedPermissions = response.headers.get("x-accepted-github-permissions");
        const permissionsMessage = acceptedPermissions
            ? ` Permissions requises : ${acceptedPermissions}.`
            : "";
        throw new Error(`GitHub API ${response.status} sur ${url} : ${response.statusText}.${permissionsMessage}`);
    }
    return (await response.json());
}
function activityExists(projectActivities, githubId) {
    return projectActivities.some((activity) => activity.metadata.github_id === githubId);
}
function getCommitOccurredAt(commit) {
    return commit.commit.author?.date
        ?? commit.commit.committer?.date
        ?? null;
}
function getPullRequestOccurredAt(pullRequest) {
    return pullRequest.merged_at
        ?? (pullRequest.updated_at !== pullRequest.created_at
            ? pullRequest.updated_at
            : pullRequest.created_at);
}
export async function syncGithubRepository(repository) {
    const existingActivities = await getActivities(repository.project_id);
    const repositoryKey = `${repository.owner}/${repository.repository}`;
    const baseUrl = `https://api.github.com/repos/${repositoryKey}`;
    const [commits, pullRequests] = await Promise.all([
        githubFetch(`${baseUrl}/commits?per_page=20`),
        githubFetch(`${baseUrl}/pulls?state=all&sort=updated&direction=desc&per_page=20`),
    ]);
    const events = [];
    for (const commit of commits) {
        const githubId = `repo:${repositoryKey}:commit:${commit.sha}`;
        if (activityExists(existingActivities, githubId)) {
            continue;
        }
        const title = commit.commit.message.split("\n")[0] || "Commit sans titre";
        events.push({
            type: "COMMIT",
            githubId,
            title: `Commit : ${title}`,
            description: commit.commit.author?.name
                ? `Par ${commit.commit.author.name}`
                : undefined,
            occurredAt: getCommitOccurredAt(commit),
            metadata: {
                github_id: githubId,
                sha: commit.sha,
                url: commit.html_url ?? null,
                repository: repositoryKey,
            },
        });
    }
    for (const pullRequest of pullRequests) {
        const isMerged = Boolean(pullRequest.merged_at);
        let type = "PR_UPDATED";
        if (isMerged) {
            type = "PR_MERGED";
        }
        else if (pullRequest.created_at === pullRequest.updated_at) {
            type = "PR_OPENED";
        }
        const occurredAt = getPullRequestOccurredAt(pullRequest);
        const githubId = `repo:${repositoryKey}:pr:${pullRequest.number}:${occurredAt}`;
        if (activityExists(existingActivities, githubId)) {
            continue;
        }
        events.push({
            type,
            githubId,
            title: `PR #${pullRequest.number} : ${pullRequest.title}`,
            occurredAt,
            metadata: {
                github_id: githubId,
                number: pullRequest.number,
                url: pullRequest.html_url ?? null,
                state: pullRequest.state,
                merged_at: pullRequest.merged_at ?? null,
                repository: repositoryKey,
            },
        });
    }
    events.sort((a, b) => {
        const aTime = a.occurredAt
            ? Date.parse(a.occurredAt)
            : 0;
        const bTime = b.occurredAt
            ? Date.parse(b.occurredAt)
            : 0;
        return aTime - bTime;
    });
    let created = 0;
    for (const event of events) {
        await createActivity({
            project_id: repository.project_id,
            type: event.type,
            source: "GITHUB",
            title: event.title,
            description: event.description,
            metadata: {
                ...event.metadata,
                occurred_at: event.occurredAt,
            },
        });
        created += 1;
    }
    return created;
}
export async function syncGithubProject(projectId) {
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
