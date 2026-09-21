import { askProjectWithAI } from "../src/services/aiService.ts";

type CapturedRequest = {
  model?: string;
  messages?: Array<{ role?: string; content?: string }>;
};

const journalPath = "journal_de_bord.md";
const repoName = "Tiruu/how_far";
const journalSource = repoName + ":" + journalPath;

const journal = `# Journal

## 52.29 Audit

Historique ancien.

## 52.29.15 Priorités de développement mises à jour

### P0 — priorité absolue

~~~text
30–50 lancers de playtest
↓
observer Safe / Greed / Combo
↓
observer compréhension et plaisir
↓
calibrer
~~~

### P1 — robustesse
- sécuriser les doubles appels ;

### P2 — game feel
- feedback du lancer ;

## 52.29.17 Diagnostic de production

La prochaine étape est la validation de la boucle actuelle.
`;

function largeText(label: string): string {
  return (label + " ").repeat(8_000);
}

const selectedFiles = [
  "scripts/a_unrelated.gd",
  "scripts/b_unrelated.gd",
  "scripts/c_unrelated.gd",
  "scripts/d_unrelated.gd",
  "scripts/e_unrelated.gd",
  "scripts/f_unrelated.gd",
  "scripts/g_unrelated.gd",
  "scripts/score_rules.gd",
  "scripts/throw_controller.gd",
  "scripts/combo_feedback.gd",
  "scripts/ui.gd",
  "scripts/main.gd",
].map((path) => ({
  path,
  reason: "test",
  content:
    path.includes("score_rules") || path.includes("throw_controller") || path.includes("combo")
      ? largeText("combo score throw ricochet")
      : largeText("unrelated"),
}));

const context = {
  repository: {
    name: "how_far",
    full_name: repoName,
    url: "https://github.com/Tiruu/how_far",
    description: "How Far?",
    default_branch: "main",
    language: "GDScript",
    visibility: "public",
  },
  repository_tree: selectedFiles.map((file) => file.path),
  selected_files: selectedFiles,
  project_documents: [
    {
      path: journalPath,
      kind: "JOURNAL_AUDIT",
      content: journal,
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
      current_state: "Importé depuis GitHub",
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

let captured: CapturedRequest | null = null;

globalThis.fetch = async (_input, init) => {
  captured = JSON.parse(String(init?.body)) as CapturedRequest;

  return {
    ok: true,
    status: 200,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            answer: "Réponse test.",
            project_state: "",
            recommendations: [],
            problems: [],
            unknowns: [],
            references: [],
          }),
        },
      };
    },
    async text() {
      return "";
    },
  } as any;
};

process.env.AI_PROVIDER = "ollama";

function getPrompt(): string {
  const content = captured?.messages?.find(
    (message) => message.role === "user",
  )?.content;

  if (!content) {
    throw new Error("No user prompt captured.");
  }

  return content;
}

const normalResult = await askProjectWithAI(
  context,
  "Pourquoi le combo est-il calculé dans score_rules.gd ?",
);

if (normalResult !== "## Compagnon de bord\n\nRéponse test.") {
  throw new Error("Unexpected normal response.");
}

const normalPrompt = getPrompt();

if (normalPrompt.length > 60_000) {
  throw new Error("Normal companion prompt exceeds 60k characters: " + normalPrompt.length);
}

const normalInput = JSON.parse(
  normalPrompt.slice(normalPrompt.indexOf("{")),
);

const normalFiles =
  normalInput.PRIMARY_PROJECT_DOSSIER.current_state_and_priorities
    .flatMap((repository: any) => repository.core_files);

if (!normalFiles.some((file: any) => file.path === "scripts/score_rules.gd")) {
  throw new Error("Retrieval did not select score_rules.gd.");
}

if (normalFiles.some((file: any) => file.path === "scripts/a_unrelated.gd")) {
  throw new Error("Retrieval selected the first unrelated file unexpectedly.");
}

const planningResponse = {
  answer: "planning",
  project_state: "",
  recommendations: [
    {
      priority_id: "P0",
      title: "P0 — priorité absolue",
      why: "test",
      detail: "test",
      effort: "test",
      timing: "NOW",
      evidence: [
        {
          source: journalSource,
          excerpt:
            "P0 — priorité absolue\n30–50 lancers de playtest\n↓\nobserver Safe / Greed / Combo\n↓\nobserver compréhension et plaisir\n↓\ncalibrer",
        },
      ],
    },
  ],
  problems: [],
  unknowns: [],
  references: [journalSource],
};

globalThis.fetch = async (_input, init) => {
  captured = JSON.parse(String(init?.body)) as CapturedRequest;

  return {
    ok: true,
    status: 200,
    async json() {
      return { message: { content: JSON.stringify(planningResponse) } };
    },
    async text() {
      return "";
    },
  } as any;
};

const planningResult = await askProjectWithAI(
  context,
  "Quelle est la prochaine étape du développement ?",
);

if (!planningResult.includes("30–50 lancers")) {
  throw new Error("Planning result did not preserve canonical P0.");
}

const planningPrompt = getPrompt();

if (planningPrompt.length > 60_000) {
  throw new Error("Planning companion prompt exceeds 60k characters: " + planningPrompt.length);
}

const planningInput = JSON.parse(
  planningPrompt.slice(planningPrompt.indexOf("{")),
);

const priorities = planningInput.CURRENT_PLANNING_PRIORITIES ?? [];

if (!priorities.some((priority: any) => priority.id === "P0")) {
  throw new Error("Planning retrieval lost canonical P0.");
}

const dossier = planningInput.PRIMARY_PROJECT_DOSSIER.current_state_and_priorities;
const journalPresent = dossier.some((repository: any) =>
  repository.current_knowledge.some(
    (document: any) => document.source === journalSource,
  ),
);

if (!journalPresent) {
  throw new Error("Planning retrieval dropped the audit journal.");
}

console.log("RETRIEVAL VERIFICATION PASSED");
console.log("normal_prompt_chars=" + normalPrompt.length);
console.log("planning_prompt_chars=" + planningPrompt.length);
