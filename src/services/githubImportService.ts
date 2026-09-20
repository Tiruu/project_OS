import { createProject, getProject } from "./projectService.js";
import {
  connectGithubRepository,
  getGithubRepositoryByRemote,
} from "./githubRepositoryService.js";
import { syncGithubProject } from "./githubService.js";

import type { GithubImportAnalysis } from "../types/githubImport.js";

type GithubRepositoryResponse = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
};

type GithubContentEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
};

type GithubContentFile = {
  content: string;
  encoding: string;
};

type GithubPackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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
      `GitHub API ${response.status} sur ${url} : ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

async function tryGithubFetch<T>(url: string): Promise<T | null> {
  try {
    return await githubFetch<T>(url);
  } catch {
    return null;
  }
}

function decodeGithubContent(file: GithubContentFile): string {
  if (file.encoding === "base64") {
    return Buffer.from(file.content, "base64").toString("utf8");
  }

  return file.content;
}

function extractDescription(
  repository: GithubRepositoryResponse,
  files: GithubContentEntry[],
  readmeContent: string | null,
): string | null {
  if (repository.description?.trim()) {
    return repository.description.trim();
  }

  if (!readmeContent) {
    return files.length > 0
      ? `Projet importé depuis GitHub (${files.length} éléments à la racine).`
      : null;
  }

  const paragraph = readmeContent
    .replace(/^\s*#.*$/gm, "")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\n/g, " ").trim())
    .find((block) => block.length >= 20);

  return paragraph ? paragraph.slice(0, 500) : null;
}

function detectType(
  technologies: string[],
  files: GithubContentEntry[],
): string {
  const fileNames = new Set(files.map((file) => file.name.toLowerCase()));

  if (fileNames.has("project.godot")) {
    return "game";
  }

  if (
    technologies.includes("Discord.js") ||
    technologies.includes("Discord")
  ) {
    return "bot";
  }

  return "repository";
}

function detectTechnologies(
  repository: GithubRepositoryResponse,
  files: GithubContentEntry[],
  packageJson: GithubPackageJson | null,
): string[] {
  const technologies = new Set<string>();
  const fileNames = new Set(files.map((file) => file.name.toLowerCase()));

  if (repository.language) {
    technologies.add(repository.language);
  }

  if (fileNames.has("project.godot")) {
    technologies.add("Godot");
    technologies.add("GDScript");
  }

  if (fileNames.has("tsconfig.json")) {
    technologies.add("TypeScript");
  }

  if (fileNames.has("dockerfile")) {
    technologies.add("Docker");
  }

  if (fileNames.has("cargo.toml")) {
    technologies.add("Rust");
  }

  if (fileNames.has("go.mod")) {
    technologies.add("Go");
  }

  if (fileNames.has("requirements.txt") || fileNames.has("pyproject.toml")) {
    technologies.add("Python");
  }

  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };

  if (dependencies["discord.js"]) {
    technologies.add("Discord.js");
  }

  if (dependencies["react"]) {
    technologies.add("React");
  }

  if (dependencies["next"]) {
    technologies.add("Next.js");
  }

  if (dependencies["@supabase/supabase-js"]) {
    technologies.add("Supabase");
  }

  if (fileNames.has("package.json")) {
    technologies.add("Node.js");
  }

  return [...technologies];
}

export async function analyzeGithubRepository(
  owner: string,
  repository: string,
): Promise<GithubImportAnalysis> {
  const encodedRepository = encodeURIComponent(repository);
  const repositoryUrl = `https://api.github.com/repos/${owner}/${encodedRepository}`;

  const remote = await githubFetch<GithubRepositoryResponse>(repositoryUrl);

  const files =
    (await tryGithubFetch<GithubContentEntry[]>(
      `${repositoryUrl}/contents?ref=${encodeURIComponent(remote.default_branch)}`,
    )) ?? [];

  const readmeEntry = files.find(
    (file) => file.type === "file" && /^readme(?:\.[^.]+)?$/i.test(file.name),
  );

  const readmeFile = readmeEntry
    ? await tryGithubFetch<GithubContentFile>(
        `${repositoryUrl}/contents/${encodeURIComponent(readmeEntry.path)}?ref=${encodeURIComponent(remote.default_branch)}`,
      )
    : null;

  const packageJsonEntry = files.find(
    (file) => file.type === "file" && file.name === "package.json",
  );

  const packageJsonFile = packageJsonEntry
    ? await tryGithubFetch<GithubContentFile>(
        `${repositoryUrl}/contents/${encodeURIComponent(packageJsonEntry.path)}?ref=${encodeURIComponent(remote.default_branch)}`,
      )
    : null;

  let packageJson: GithubPackageJson | null = null;

  if (packageJsonFile) {
    try {
      packageJson = JSON.parse(
        decodeGithubContent(packageJsonFile),
      ) as GithubPackageJson;
    } catch {
      packageJson = null;
    }
  }

  const readmeContent = readmeFile
    ? decodeGithubContent(readmeFile)
    : null;

  const technologies = detectTechnologies(
    remote,
    files,
    packageJson,
  );

  return {
    owner,
    repository: remote.name,
    url: remote.html_url,
    default_branch: remote.default_branch,
    name: remote.name,
    description: extractDescription(
      remote,
      files,
      readmeContent,
    ),
    technologies,
    type: detectType(technologies, files),
  };
}

export async function importGithubProject(
  owner: string,
  repository: string,
): Promise<{
  projectId: string;
  projectName: string;
  analysis: GithubImportAnalysis;
  created: boolean;
  syncedActivities: number;
}> {
  const existingRepository = await getGithubRepositoryByRemote(
    owner,
    repository,
  );

  if (existingRepository) {
    const project = await getProject(existingRepository.project_id);
    const syncedActivities = await syncGithubProject(project.id);

    return {
      projectId: project.id,
      projectName: project.name,
      analysis: {
        owner,
        repository,
        url: existingRepository.url,
        default_branch: existingRepository.default_branch,
        name: project.name,
        description: project.description,
        technologies: project.technologies,
        type: project.type,
      },
      created: false,
      syncedActivities,
    };
  }

  const analysis = await analyzeGithubRepository(owner, repository);

  const project = await createProject({
    name: analysis.name,
    type: analysis.type,
    technologies: analysis.technologies,
    description: analysis.description ?? undefined,
    current_state: "Importé depuis GitHub",
  });

  await connectGithubRepository({
    project_id: project.id,
    owner: analysis.owner,
    repository: analysis.repository,
    url: analysis.url,
    default_branch: analysis.default_branch,
  });

  const syncedActivities = await syncGithubProject(project.id);

  return {
    projectId: project.id,
    projectName: project.name,
    analysis,
    created: true,
    syncedActivities,
  };
}
