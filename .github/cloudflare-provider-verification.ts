import { askProjectWithAI } from "../src/services/aiService.ts";

type FetchBody = {
  messages?: Array<{ role?: string; content?: string }>;
  response_format?: unknown;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  seed?: number;
  repetition_penalty?: number;
};

const source = "Tiruu/how_far:journal.md";
const excerpt =
  "P0 — priorité absolue\n30–50 lancers de playtest\n↓\nobserver Safe / Greed / Combo\n↓\nobserver compréhension et plaisir\n↓\ncalibrer";

const context = {
  repository: {
    name: "how_far",
    full_name: "Tiruu/how_far",
    url: "https://github.com/Tiruu/how_far",
    description: "How Far?",
    default_branch: "main",
    language: "GDScript",
    visibility: "public",
  },
  repository_tree: ["scripts/main.gd"],
  selected_files: [
    {
      path: "scripts/main.gd",
      reason: "core",
      content: "combo score throw",
    },
  ],
  project_documents: [
    {
      path: "journal.md",
      kind: "JOURNAL_AUDIT",
      content:
        "# Journal\n\n## P0 — priorité absolue\n" +
        excerpt +
        "\n\n## P1 — robustesse\n- test doubles",
    },
  ],
  readme: "How Far",
  package_json: null,
  repositories: [],
  project_os: {
    project: {
      id: "p1",
      name: "How Far?",
      type: "game",
      technologies: ["Godot", "GDScript"],
      purpose: "Ricochet game",
      description: "Throw a stone farther.",
      current_state: "Validation de la boucle",
    },
    active_tasks: [],
    tasks: [],
    active_decisions: [],
    decisions: [],
    recent_activities: [],
    reference_index: {
      tasks: [],
      decisions: [],
      activities: [],
    },
  },
} as any;

const planningJson = {
  answer: "La prochaine étape est la validation de la boucle.",
  project_state: "Validation de la boucle.",
  recommendations: [
    {
      priority_id: "P0",
      title: "P0 — priorité absolue",
      why: "Source du journal.",
      detail: excerpt,
      effort: "À observer",
      timing: "NOW",
      evidence: [{ source, excerpt }],
    },
  ],
  problems: [],
  unknowns: [],
  references: [source],
};

let calls: FetchBody[] = [];
let failGemini = false;

process.env.AI_PROVIDER = "cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_API_TOKEN = "test-token";
process.env.CLOUDFLARE_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
process.env.CLOUDFLARE_MAX_TOKENS = "1800";
process.env.CLOUDFLARE_TEMPERATURE = "0";

globalThis.fetch = async (input, init) => {
  const url = String(input);

  if (url.includes("generativelanguage.googleapis.com")) {
    failGemini = true;
    return {
      ok: false,
      status: 429,
      async text() {
        return '{"error":{"message":"rate limit"}}';
      },
      async json() {
        return {};
      },
    } as any;
  }

  calls.push(JSON.parse(String(init?.body)) as FetchBody);

  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        success: true,
        result: { response: JSON.stringify(planningJson) },
      });
    },
    async json() {
      return {
        success: true,
        result: { response: JSON.stringify(planningJson) },
      };
    },
  } as any;
};

const result = await askProjectWithAI(
  context,
  "Quelle est la prochaine étape du développement ?",
);

if (!result.includes("30–50 lancers")) {
  throw new Error("Cloudflare provider did not produce canonical planning result.");
}

if (calls.length !== 1) {
  throw new Error("Expected exactly one Cloudflare call.");
}

const request = calls[0];

if (!request.messages?.some((message) => message.role === "system")) {
  throw new Error("Cloudflare request missing system message.");
}

if (!request.messages?.some((message) => message.role === "user")) {
  throw new Error("Cloudflare request missing user message.");
}

if (!request.response_format) {
  throw new Error("Cloudflare request missing JSON response_format.");
}

if (request.stream !== false) {
  throw new Error("Cloudflare request must be non-streaming.");
}

if (request.max_tokens !== 1800) {
  throw new Error("Cloudflare max_tokens configuration was not forwarded.");
}

if (request.temperature !== 0) {
  throw new Error("Cloudflare temperature configuration was not forwarded.");
}

if (request.seed !== 42) {
  throw new Error("Cloudflare deterministic seed was not forwarded.");
}

if (request.repetition_penalty !== 1.05) {
  throw new Error("Cloudflare repetition penalty was not forwarded.");
}

process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-gemini";
process.env.GEMINI_MODEL = "gemini-test";
process.env.GEMINI_FALLBACK_MODEL = "gemini-test-fallback";

calls = [];
const fallbackResult = await askProjectWithAI(
  context,
  "Quelle est la prochaine étape du développement ?",
);

if (!fallbackResult.includes("30–50 lancers")) {
  throw new Error("Gemini -> Cloudflare fallback did not produce valid result.");
}

if (!failGemini) {
  throw new Error("Gemini fallback path was not exercised.");
}

if (calls.length !== 1) {
  throw new Error("Expected exactly one Cloudflare fallback call.");
}

console.log("CLOUDFLARE PROVIDER VERIFICATION PASSED");
