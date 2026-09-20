import "dotenv/config";

type GithubRepositoryResponse = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  visibility?: string;
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
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type GithubRepositoryContext = {
  project?: {
    name: string;
    type: string;
    technologies: string[];
    description: string | null;
    current_state: string | null;
  };
  recent_activity?: string[];
  repository: {
    name: string;
    full_name: string;
    url: string;
    description: string | null;
    default_branch: string;
    language: string | null;
    visibility: string;
  };
  root_files: string[];
  readme: string | null;
  package_json: GithubPackageJson | null;
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

function decodeGithubContent(file: GithubContentFile): string {
  if (file.encoding === "base64") {
    return Buffer.from(file.content, "base64").toString("utf8");
  }

  return file.content;
}

async function getOptionalGithubFile<T>(
  url: string,
): Promise<T | null> {
  try {
    return await githubFetch<T>(url);
  } catch {
    return null;
  }
}

export async function getGithubRepositoryContext(
  owner: string,
  repository: string,
): Promise<GithubRepositoryContext> {
  const repositoryUrl =
    `https://api.github.com/repos/${owner}/${encodeURIComponent(repository)}`;

  const remote =
    await githubFetch<GithubRepositoryResponse>(repositoryUrl);

  const files =
    (await getOptionalGithubFile<GithubContentEntry[]>(
      `${repositoryUrl}/contents?ref=${encodeURIComponent(remote.default_branch)}`,
    )) ?? [];

  const readmeEntry = files.find(
    (file) =>
      file.type === "file" &&
      /^readme(?:\.[^.]+)?$/i.test(file.name),
  );

  const packageJsonEntry = files.find(
    (file) =>
      file.type === "file" &&
      file.name.toLowerCase() === "package.json",
  );

  const [readmeFile, packageJsonFile] = await Promise.all([
    readmeEntry
      ? getOptionalGithubFile<GithubContentFile>(
          `${repositoryUrl}/contents/${encodeURIComponent(readmeEntry.path)}?ref=${encodeURIComponent(remote.default_branch)}`,
        )
      : Promise.resolve(null),
    packageJsonEntry
      ? getOptionalGithubFile<GithubContentFile>(
          `${repositoryUrl}/contents/${encodeURIComponent(packageJsonEntry.path)}?ref=${encodeURIComponent(remote.default_branch)}`,
        )
      : Promise.resolve(null),
  ]);

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

  return {
    repository: {
      name: remote.name,
      full_name: remote.full_name,
      url: remote.html_url,
      description: remote.description,
      default_branch: remote.default_branch,
      language: remote.language,
      visibility: remote.visibility ?? "unknown",
    },
    root_files: files.map((file) => file.name).sort(),
    readme: readmeFile
      ? decodeGithubContent(readmeFile).slice(0, 15000)
      : null,
    package_json: packageJson,
  };
}
