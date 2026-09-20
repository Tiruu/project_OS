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
  size?: number;
};

type GithubContentFile = {
  content: string;
  encoding: string;
  size?: number;
};

type GithubTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

type GithubTreeResponse = {
  tree: GithubTreeEntry[];
  truncated?: boolean;
};

type GithubPackageJson = {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type GithubContextFile = {
  path: string;
  reason: string;
  content: string;
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
  repository_tree: string[];
  selected_files: GithubContextFile[];
  readme: string | null;
  package_json: GithubPackageJson | null;
};

const MAX_TREE_ENTRIES = 250;
const MAX_SELECTED_FILES = 12;
const MAX_FILE_CHARS = 8000;
const MAX_TOTAL_FILE_CHARS = 50000;

const IGNORED_PATH_PARTS = new Set([
  ".git",
  ".godot",
  ".import",
  ".idea",
  ".vs",
  "node_modules",
  "dist",
  "build",
  "bin",
  "obj",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
]);

const ANALYZABLE_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".cs",
  ".gd",
  ".go",
  ".h",
  ".hpp",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".lua",
  ".md",
  ".php",
  ".py",
  ".rs",
  ".scene",
  ".toml",
  ".ts",
  ".tsx",
  ".tscn",
  ".txt",
  ".vue",
  ".yaml",
  ".yml",
]);

const IMPORTANT_EXACT_NAMES = new Set([
  "project.godot",
  "package.json",
  "cargo.toml",
  "dockerfile",
  "compose.yml",
  "compose.yaml",
  "tsconfig.json",
]);

async function githubFetch<T>(url: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Project-OS",
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      "GitHub API " +
        response.status +
        " sur " +
        url +
        " : " +
        response.statusText,
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

function isIgnoredPath(path: string): boolean {
  return path
    .split("/")
    .some((part) => IGNORED_PATH_PARTS.has(part));
}

function getExtension(path: string): string {
  const lower = path.toLowerCase();
  const lastDot = lower.lastIndexOf(".");

  return lastDot === -1 ? "" : lower.slice(lastDot);
}

function isAnalyzableFile(path: string): boolean {
  const lower = path.toLowerCase();
  const fileName = lower.split("/").at(-1) ?? "";

  if (isIgnoredPath(path)) {
    return false;
  }

  if (IMPORTANT_EXACT_NAMES.has(fileName)) {
    return true;
  }

  return ANALYZABLE_EXTENSIONS.has(getExtension(path));
}

function normalizeFocusTokens(focusText: string | null): string[] {
  if (!focusText?.trim()) {
    return [];
  }

  return focusText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 16);
}

function isDevelopmentPlanningQuestion(focusText: string | null): boolean {
  const text = focusText?.toLowerCase() ?? "";

  return [
    "suite du développement",
    "suite du developpement",
    "prochaine modification",
    "prochaine tâche",
    "prochaine tache",
    "prochaine fonctionnalité",
    "prochaine fonctionnalite",
    "quoi faire ensuite",
    "quelle modification",
    "quelle fonctionnalité",
    "quelle fonctionnalite",
    "next step",
    "next feature",
    "next task",
  ].some((phrase) => text.includes(phrase));
}

function scoreContextFile(
  path: string,
  focusText: string | null = null,
): {
  score: number;
  reason: string;
} {
  const lower = path.toLowerCase();
  const fileName = lower.split("/").at(-1) ?? "";
  let score = 0;
  let reason = "Code source pertinent";

  if (fileName === "project.godot") {
    score += 140;
    reason = "Manifest Godot";
  }

  if (
    fileName === "readme.md" ||
    fileName === "readme" ||
    fileName.includes("journal") ||
    fileName.includes("roadmap") ||
    fileName.includes("changelog")
  ) {
    score += 130;
    reason = "Documentation du projet";
  }

  if (
    fileName === "package.json" ||
    fileName === "cargo.toml" ||
    fileName === "tsconfig.json" ||
    fileName === "dockerfile"
  ) {
    score += 120;
    reason = "Configuration principale";
  }

  if (
    fileName.startsWith("main.") ||
    fileName.startsWith("index.") ||
    fileName === "app.ts" ||
    fileName === "app.tsx"
  ) {
    score += 110;
    reason = "Point d'entrée probable";
  }

  if (
    lower.includes("/src/") ||
    lower.startsWith("src/") ||
    lower.includes("/scripts/") ||
    lower.startsWith("scripts/") ||
    lower.includes("/scenes/") ||
    lower.startsWith("scenes/")
  ) {
    score += 70;
  }

  if (
    lower.includes("/test") ||
    lower.includes(".test.") ||
    lower.includes(".spec.")
  ) {
    score += 25;
    reason = "Tests ou vérifications existants";
  }

  if (getExtension(path) === ".gd") {
    score += 65;
    reason = "Script Godot";
  } else if (getExtension(path) === ".ts") {
    score += 65;
    reason = "Code TypeScript";
  } else if (getExtension(path) === ".tscn") {
    score += 50;
    reason = "Scène Godot";
  } else if (getExtension(path) === ".md") {
    score += 40;
    reason = "Documentation";
  }

  const focusTokens = normalizeFocusTokens(focusText);

  if (focusTokens.length > 0) {
    const pathTokens = lower
      .replace(/[^a-z0-9_./-]+/g, " ")
      .split(/[\s/_.-]+/)
      .filter((token) => token.length >= 4);

    const focusMatches = focusTokens.filter((token) =>
      pathTokens.some((pathToken) =>
        pathToken === token || pathToken.includes(token) || token.includes(pathToken),
      ),
    ).length;

    score += focusMatches * 35;
  }

  if (isDevelopmentPlanningQuestion(focusText)) {
    if (getExtension(path) === ".gd") {
      score += 90;
      reason = "Code gameplay actuel";
    }

    if (
      lower.includes("/scripts/") ||
      lower.startsWith("scripts/") ||
      lower.includes("/src/") ||
      lower.startsWith("src/")
    ) {
      score += 45;
    }

    if (
      fileName.includes("journal") ||
      fileName.includes("roadmap") ||
      fileName.includes("changelog")
    ) {
      score += 90;
      reason = "Historique et feuille de route du projet";
    }

    if (fileName === "project.godot") {
      score -= 120;
    }

    if (fileName.endsWith(".tscn")) {
      score += 15;
    }
  }

  const depth = path.split("/").length;
  score -= Math.max(0, depth - 4) * 3;

  return { score, reason };
}

function isHistoricalDocumentationPath(path: string): boolean {
  const fileName = path.toLowerCase().split("/").at(-1) ?? "";

  return (
    fileName.includes("journal") ||
    fileName.includes("roadmap") ||
    fileName.includes("changelog")
  );
}

function selectFocusedContent(
  content: string,
  path: string,
  focusText: string | null,
  maxChars: number,
): string {
  if (content.length <= maxChars) {
    return content;
  }

  const isMarkdown = getExtension(path) === ".md";
  const isHistoricalDoc = isHistoricalDocumentationPath(path);

  if (isMarkdown && isHistoricalDoc && !focusText?.trim()) {
    const headChars = Math.floor(maxChars * 0.35);
    const tailChars = maxChars - headChars;

    return (
      content.slice(0, headChars) +
      "\n\n[... partie historique intermédiaire omise ...]\n\n" +
      content.slice(-tailChars)
    );
  }

  if (focusText?.trim()) {
    const normalizedFocus = focusText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9_./-]+/g, " ")
      .trim();

    const focusTokens = normalizedFocus
      .split(/\s+/)
      .filter((token) => token.length >= 5)
      .slice(0, 12);

    if (focusTokens.length > 0) {
      const lines = content.split("\n");
      const matchedLineIndexes: number[] = [];

      for (let index = 0; index < lines.length; index += 1) {
        const normalizedLine = lines[index]
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "");

        const matched = focusTokens.some((token) =>
          normalizedLine.includes(token),
        );

        if (matched) {
          matchedLineIndexes.push(index);
        }
      }

      if (matchedLineIndexes.length > 0) {
        const windows: Array<{ start: number; end: number }> = [];
        const maxWindows = 4;
        const radius = isMarkdown ? 28 : 45;

        for (const index of matchedLineIndexes) {
          const start = Math.max(0, index - radius);
          const end = Math.min(lines.length, index + radius + 1);

          const overlaps = windows.some(
            (window) =>
              start <= window.end &&
              end >= window.start,
          );

          if (!overlaps) {
            windows.push({ start, end });

            if (windows.length >= maxWindows) {
              break;
            }
          }
        }

        let focused = windows
          .map(
            (window) =>
              lines.slice(window.start, window.end).join("\n"),
          )
          .join("\n\n[... extrait suivant ...]\n\n");

        if (focused.length <= maxChars) {
          return focused;
        }

        focused = focused.slice(0, maxChars);
        return focused;
      }
    }
  }

  return content.slice(0, maxChars);
}

function selectContextFiles(
  tree: GithubTreeEntry[],
  readmePath: string | null,
  packageJsonPath: string | null,
  focusText: string | null = null,
): Array<{ path: string; reason: string }> {
  const candidates = tree
    .filter((entry) => entry.type === "blob")
    .filter((entry) => isAnalyzableFile(entry.path))
    .filter((entry) => entry.path !== readmePath)
    .filter((entry) => entry.path !== packageJsonPath)
    .map((entry) => {
      const scored = scoreContextFile(entry.path, focusText);

      return {
        path: entry.path,
        reason: scored.reason,
        score: scored.score,
      };
    })
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, MAX_SELECTED_FILES);
}

export async function getGithubRepositoryContext(
  owner: string,
  repository: string,
  focusText: string | null = null,
): Promise<GithubRepositoryContext> {
  const repositoryUrl =
    "https://api.github.com/repos/" +
    owner +
    "/" +
    encodeURIComponent(repository);

  const remote =
    await githubFetch<GithubRepositoryResponse>(repositoryUrl);

  const files =
    (await getOptionalGithubFile<GithubContentEntry[]>(
      repositoryUrl +
        "/contents?ref=" +
        encodeURIComponent(remote.default_branch),
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

  const [readmeFile, packageJsonFile, treeResponse] = await Promise.all([
    readmeEntry
      ? getOptionalGithubFile<GithubContentFile>(
          repositoryUrl +
            "/contents/" +
            encodeURIComponent(readmeEntry.path) +
            "?ref=" +
            encodeURIComponent(remote.default_branch),
        )
      : Promise.resolve(null),
    packageJsonEntry
      ? getOptionalGithubFile<GithubContentFile>(
          repositoryUrl +
            "/contents/" +
            encodeURIComponent(packageJsonEntry.path) +
            "?ref=" +
            encodeURIComponent(remote.default_branch),
        )
      : Promise.resolve(null),
    getOptionalGithubFile<GithubTreeResponse>(
      repositoryUrl +
        "/git/trees/" +
        encodeURIComponent(remote.default_branch) +
        "?recursive=1",
    ),
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

  const tree =
    treeResponse?.tree.filter((entry) => entry.type === "blob") ??
    files
      .filter((file) => file.type === "file")
      .map((file) => ({
        path: file.path,
        type: "blob" as const,
        size: file.size,
      }));

  const readmePath = readmeEntry?.path ?? null;
  const packageJsonPath = packageJsonEntry?.path ?? null;

  const selectedDefinitions = selectContextFiles(
    tree,
    readmePath,
    packageJsonPath,
    focusText,
  );

  const selectedFiles: GithubContextFile[] = [];
  let totalChars = 0;

  for (const selected of selectedDefinitions) {
    if (selectedFiles.length >= MAX_SELECTED_FILES) {
      break;
    }

    if (totalChars >= MAX_TOTAL_FILE_CHARS) {
      break;
    }

    const file = await getOptionalGithubFile<GithubContentFile>(
      repositoryUrl +
        "/contents/" +
        encodeURIComponent(selected.path) +
        "?ref=" +
        encodeURIComponent(remote.default_branch),
    );

    if (!file) {
      continue;
    }

    const availableChars = Math.min(
      MAX_FILE_CHARS,
      MAX_TOTAL_FILE_CHARS - totalChars,
    );

    const content = selectFocusedContent(
      decodeGithubContent(file),
      selected.path,
      focusText,
      availableChars,
    );

    if (!content.trim()) {
      continue;
    }

    selectedFiles.push({
      path: selected.path,
      reason: selected.reason,
      content,
    });

    totalChars += content.length;
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
    repository_tree: tree
      .filter((entry) => !isIgnoredPath(entry.path))
      .map((entry) => entry.path)
      .sort()
      .slice(0, MAX_TREE_ENTRIES),
    selected_files: selectedFiles,
    readme: readmeFile
      ? decodeGithubContent(readmeFile).slice(0, 15000)
      : null,
    package_json: packageJson,
  };
}
