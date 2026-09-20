import "dotenv/config";
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
async function githubFetch(url) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Project-OS",
    };
    if (token) {
        headers.Authorization = "Bearer " + token;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error("GitHub API " +
            response.status +
            " sur " +
            url +
            " : " +
            response.statusText);
    }
    return (await response.json());
}
function decodeGithubContent(file) {
    if (file.encoding === "base64") {
        return Buffer.from(file.content, "base64").toString("utf8");
    }
    return file.content;
}
async function getOptionalGithubFile(url) {
    try {
        return await githubFetch(url);
    }
    catch {
        return null;
    }
}
function isIgnoredPath(path) {
    return path
        .split("/")
        .some((part) => IGNORED_PATH_PARTS.has(part));
}
function getExtension(path) {
    const lower = path.toLowerCase();
    const lastDot = lower.lastIndexOf(".");
    return lastDot === -1 ? "" : lower.slice(lastDot);
}
function isAnalyzableFile(path) {
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
function scoreContextFile(path) {
    const lower = path.toLowerCase();
    const fileName = lower.split("/").at(-1) ?? "";
    let score = 0;
    let reason = "Code source pertinent";
    if (fileName === "project.godot") {
        score += 140;
        reason = "Manifest Godot";
    }
    if (fileName === "readme.md" ||
        fileName === "readme" ||
        fileName.includes("journal") ||
        fileName.includes("roadmap") ||
        fileName.includes("changelog")) {
        score += 130;
        reason = "Documentation du projet";
    }
    if (fileName === "package.json" ||
        fileName === "cargo.toml" ||
        fileName === "tsconfig.json" ||
        fileName === "dockerfile") {
        score += 120;
        reason = "Configuration principale";
    }
    if (fileName.startsWith("main.") ||
        fileName.startsWith("index.") ||
        fileName === "app.ts" ||
        fileName === "app.tsx") {
        score += 110;
        reason = "Point d'entrée probable";
    }
    if (lower.includes("/src/") ||
        lower.startsWith("src/") ||
        lower.includes("/scripts/") ||
        lower.startsWith("scripts/") ||
        lower.includes("/scenes/") ||
        lower.startsWith("scenes/")) {
        score += 70;
    }
    if (lower.includes("/test") ||
        lower.includes(".test.") ||
        lower.includes(".spec.")) {
        score += 25;
        reason = "Tests ou vérifications existants";
    }
    if (getExtension(path) === ".gd") {
        score += 65;
        reason = "Script Godot";
    }
    else if (getExtension(path) === ".ts") {
        score += 65;
        reason = "Code TypeScript";
    }
    else if (getExtension(path) === ".tscn") {
        score += 50;
        reason = "Scène Godot";
    }
    else if (getExtension(path) === ".md") {
        score += 40;
        reason = "Documentation";
    }
    const depth = path.split("/").length;
    score -= Math.max(0, depth - 4) * 3;
    return { score, reason };
}
function selectContextFiles(tree, readmePath, packageJsonPath) {
    const candidates = tree
        .filter((entry) => entry.type === "blob")
        .filter((entry) => isAnalyzableFile(entry.path))
        .filter((entry) => entry.path !== readmePath)
        .filter((entry) => entry.path !== packageJsonPath)
        .map((entry) => {
        const scored = scoreContextFile(entry.path);
        return {
            path: entry.path,
            reason: scored.reason,
            score: scored.score,
        };
    })
        .sort((a, b) => b.score - a.score);
    return candidates.slice(0, MAX_SELECTED_FILES);
}
export async function getGithubRepositoryContext(owner, repository) {
    const repositoryUrl = "https://api.github.com/repos/" +
        owner +
        "/" +
        encodeURIComponent(repository);
    const remote = await githubFetch(repositoryUrl);
    const files = (await getOptionalGithubFile(repositoryUrl +
        "/contents?ref=" +
        encodeURIComponent(remote.default_branch))) ?? [];
    const readmeEntry = files.find((file) => file.type === "file" &&
        /^readme(?:\.[^.]+)?$/i.test(file.name));
    const packageJsonEntry = files.find((file) => file.type === "file" &&
        file.name.toLowerCase() === "package.json");
    const [readmeFile, packageJsonFile, treeResponse] = await Promise.all([
        readmeEntry
            ? getOptionalGithubFile(repositoryUrl +
                "/contents/" +
                encodeURIComponent(readmeEntry.path) +
                "?ref=" +
                encodeURIComponent(remote.default_branch))
            : Promise.resolve(null),
        packageJsonEntry
            ? getOptionalGithubFile(repositoryUrl +
                "/contents/" +
                encodeURIComponent(packageJsonEntry.path) +
                "?ref=" +
                encodeURIComponent(remote.default_branch))
            : Promise.resolve(null),
        getOptionalGithubFile(repositoryUrl +
            "/git/trees/" +
            encodeURIComponent(remote.default_branch) +
            "?recursive=1"),
    ]);
    let packageJson = null;
    if (packageJsonFile) {
        try {
            packageJson = JSON.parse(decodeGithubContent(packageJsonFile));
        }
        catch {
            packageJson = null;
        }
    }
    const tree = treeResponse?.tree.filter((entry) => entry.type === "blob") ??
        files
            .filter((file) => file.type === "file")
            .map((file) => ({
            path: file.path,
            type: "blob",
            size: file.size,
        }));
    const readmePath = readmeEntry?.path ?? null;
    const packageJsonPath = packageJsonEntry?.path ?? null;
    const selectedDefinitions = selectContextFiles(tree, readmePath, packageJsonPath);
    const selectedFiles = [];
    let totalChars = 0;
    for (const selected of selectedDefinitions) {
        if (selectedFiles.length >= MAX_SELECTED_FILES) {
            break;
        }
        if (totalChars >= MAX_TOTAL_FILE_CHARS) {
            break;
        }
        const file = await getOptionalGithubFile(repositoryUrl +
            "/contents/" +
            encodeURIComponent(selected.path) +
            "?ref=" +
            encodeURIComponent(remote.default_branch));
        if (!file) {
            continue;
        }
        const content = decodeGithubContent(file).slice(0, Math.min(MAX_FILE_CHARS, MAX_TOTAL_FILE_CHARS - totalChars));
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
