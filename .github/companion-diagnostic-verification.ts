import { askProjectWithAI } from "../src/services/aiService.ts";

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
      content: "combo score throw stone ricochet charge safe greed overcharge",
    },
  ],
  project_documents: [
    {
      path: "journal.md",
      kind: "JOURNAL_AUDIT",
      content:
        "# Journal\n\n## 52.29.15 Priorités de développement mises à jour\n## P0 — priorité absolue\n" +
        excerpt +
        "\n\n## P1 — robustesse\n- secure stone finish",
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

const analysisJson = {
  answer:
    "La boucle principale paraît suffisamment structurée pour passer à une vraie phase de validation. Mon principal risque est de calibrer trop tôt sur des impressions ponctuelles plutôt que sur des observations répétées de Safe, Greed et Combo.",
  project_state:
    "Le projet est en validation de boucle avant ajout de nouvelles mécaniques majeures.",
  recommendations: [
    {
      priority_id: "P0",
      title: "Valider la boucle sur un volume réel de lancers",
      why: "Le journal place cette validation avant la calibration.",
      detail: excerpt,
      effort: "30–50 lancers",
      timing: "NOW",
      evidence: [{ source, excerpt }],
    },
  ],
  problems: [
    {
      title: "Risque de calibrer trop tôt",
      description:
        "La priorité actuelle demande d'observer la boucle avant de calibrer.",
      impact:
        "Un réglage prématuré pourrait masquer les comportements réels de Safe, Greed et Combo.",
      evidence: [{ source, excerpt }],
    },
  ],
  unknowns: [
    "On ne sait pas encore comment les joueurs répartissent réellement leurs choix entre Safe et Greed.",
  ],
  references: [source],
};

let seenRequest: Record<string, unknown> | null = null;
let mode: "planning" | "analysis" | null = null;

process.env.AI_PROVIDER = "cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_API_TOKEN = "test-token";
process.env.CLOUDFLARE_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
process.env.CLOUDFLARE_MAX_TOKENS = "1800";
process.env.CLOUDFLARE_TEMPERATURE = "0";

globalThis.fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body));
  const user = body.messages?.find((message: any) => message.role === "user")?.content ?? "";

  try {
    const parsed = JSON.parse(user);
    seenRequest = parsed.PROJECT_COMPANION_REQUEST;
    mode = seenRequest?.is_planning_request
      ? "planning"
      : seenRequest?.is_project_analysis_request
        ? "analysis"
        : null;
  } catch {
    // Fail below through the assertions.
  }

  const response = mode === "planning" ? planningJson : analysisJson;

  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        success: true,
        result: { response: JSON.stringify(response) },
      });
    },
  } as any;
};

const planning = await askProjectWithAI(
  context,
  "Quelle est la prochaine étape du développement ?",
);

if (seenRequest?.is_planning_request !== true || seenRequest?.is_project_analysis_request === true) {
  throw new Error("Planning mode flags are incorrect.");
}

if (!planning.includes("30–50 lancers") || !planning.includes("P0")) {
  throw new Error("Planning behavior regressed.");
}

const analysis = await askProjectWithAI(
  context,
  "Qu'est-ce que tu penses de l'état actuel du projet ?",
);

if (seenRequest?.is_project_analysis_request !== true || seenRequest?.is_planning_request === true) {
  throw new Error("Analysis mode flags are incorrect.");
}

if (!analysis.includes("Mon principal risque") || !analysis.includes("Risque de calibrer trop tôt")) {
  throw new Error("Analysis response did not render diagnostic/problem content.");
}

if (!analysis.includes("### Problèmes détectés")) {
  throw new Error("Analysis response did not render problems section.");
}

console.log("COMPANION DIAGNOSTIC VERIFICATION PASSED");
