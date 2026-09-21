import http from "node:http";

const journalPath = "journal_de_bord_HowFar_complet_mis_a_jour.md";
const p0Title = "P0 — priorité absolue";
const p0Body = [
  "30–50 lancers de playtest",
  "↓",
  "observer Safe / Greed / Combo",
  "↓",
  "observer compréhension et plaisir",
  "↓",
  "calibrer",
].join("\n");
const p0Excerpt = p0Title + "\n" + p0Body;

const source = "Tiruu/how_far:" + journalPath;

const context = {
  repository: {
    name: "how_far",
    full_name: "Tiruu/how_far",
    url: "https://github.com/Tiruu/how_far",
    description: "How Far",
    default_branch: "main",
    language: "GDScript",
    visibility: "public",
  },
  repository_tree: [
    "journal_de_bord_HowFar_complet_mis_a_jour.md",
    "scripts/main.gd",
    "scripts/throw_controller.gd",
  ],
  selected_files: [],
  project_documents: [
    {
      path: journalPath,
      kind: "JOURNAL_AUDIT",
      content:
        "# 52.29 Audit complet\n\n### P4 — architecture\nold\n\n### " +
        p0Title +
        "\n\n" +
        p0Body +
        "\n\n### P1 — robustesse\nsecure the end",
    },
  ],
  readme: null,
  package_json: null,
  repositories: [],
  project_os: {
    project: {
      id: "test-project",
      name: "How Far",
      type: "game",
      technologies: ["Godot", "GDScript"],
      purpose: "jeu d'arcade",
      description: "test",
      current_state: "Consolidation, calibration et game feel",
    },
    tasks: [],
    active_tasks: [],
    decisions: [],
    active_decisions: [],
    recent_activities: [],
    reference_index: {
      tasks: [],
      decisions: [],
      activities: [],
    },
  },
};

context.repositories = [context];

function responseFor(i) {
  const variants = [
    {
      answer: "Create ThrowMechanic.gd because physics is missing.",
      project_state: "Prototype missing the real gameplay.",
      recommendations: [
        {
          priority_id: "P0",
          title: p0Title,
          why: "Wrong but grounded.",
          detail: "Wrong detail.",
          effort: "high",
          timing: "NOW",
          evidence: [{ source, excerpt: p0Excerpt }],
        },
      ],
      problems: [],
      unknowns: [],
      references: [source],
    },
    {
      answer: "Build Platform.gd and add collision physics.",
      project_state: "Physics incomplete.",
      recommendations: [
        {
          priority_id: "P9",
          title: "Invented mechanic",
          why: "Bad priority.",
          detail: "Bad.",
          effort: "high",
          timing: "NOW",
          evidence: [{ source: "Tiruu/how_far:scripts/ui.gd", excerpt: "charge ui" }],
        },
      ],
      problems: [],
      unknowns: [],
      references: [],
    },
    {
      answer: "The loop is ready for calibration.",
      project_state: "Calibration.",
      recommendations: [
        {
          title: "Calibration",
          why: "No priority id.",
          detail: "Use the current loop.",
          effort: "medium",
          timing: "NOW",
          evidence: [{ source, excerpt: p0Excerpt }],
        },
      ],
      problems: [],
      unknowns: [],
      references: [source],
    },
    {
      answer: "The correct next step is to add a shop.",
      project_state: "Needs progression.",
      recommendations: [],
      problems: [],
      unknowns: [],
      references: [],
    },
    {
      answer: "Continue current validation.",
      project_state: "Consolidation.",
      recommendations: [
        {
          priority_id: "P0",
          title: "Wrong title but same priority",
          why: "Good grounding.",
          detail: "Model wording.",
          effort: "medium",
          timing: "NOW",
          evidence: [{ source, excerpt: p0Excerpt }],
        },
      ],
      problems: [],
      unknowns: [],
      references: [source],
    },
  ];

  return variants[i % variants.length];
}

let requestCount = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    requestCount += 1;
    const payload = responseFor(requestCount - 1);
    const response = {
      model: "mock-companion",
      done: true,
      message: {
        role: "assistant",
        content: JSON.stringify(payload),
      },
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
  });
});

const port = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

process.env.AI_PROVIDER = "ollama";
process.env.OLLAMA_URL = "http://127.0.0.1:" + port + "/api/chat";
process.env.OLLAMA_MODEL = "mock-companion";

const { askProjectWithAI } = await import("../../src/services/aiService.ts");

const total = 10_000;
let failures = 0;
let fallbackCount = 0;
let modelPassCount = 0;

for (let i = 0; i < total; i += 1) {
  const result = await askProjectWithAI(
    context,
    "propose moi la suite du développement de how_far",
  );

  if (
    !result.includes("30–50 lancers de playtest") ||
    !result.includes("P0 — priorité absolue")
  ) {
    failures += 1;
    continue;
  }

  if (
    result.includes("ThrowMechanic.gd") ||
    result.includes("Platform.gd") ||
    result.includes("add a shop")
  ) {
    failures += 1;
    continue;
  }

  if (result.includes("La prochaine étape est d'abord de suivre la priorité")) {
    modelPassCount += 1;
  } else {
    fallbackCount += 1;
  }
}

server.close();

if (failures > 0) {
  throw new Error(
    "Companion stress test failed: " +
      failures +
      "/" +
      total +
      " invalid results.",
  );
}

console.log(
  JSON.stringify({
    total,
    failures,
    modelPassCount,
    fallbackCount,
    successRate: ((total - failures) / total) * 100,
  }),
);
