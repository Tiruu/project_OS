import "dotenv/config";

import type {
  AiEvidence,
  AiReview,
  AiSuggestedTask,
  AiTaskKind,
} from "../types/aiReview.js";
import type { ProjectAiContext } from "./projectAiContextService.js";

type OllamaChatResponse = {
  model?: string;
  done_reason?: string;
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
};

type OllamaThinkLevel =
  | false
  | "low"
  | "medium"
  | "high"
  | "max";

type RawAiObservedFeature = {
  name: string;
  description: string;
  evidence: string[];
};

type RawAiSuggestedTask = {
  title: string;
  task_kind: AiTaskKind;
  priority: number;
  problem: string;
  reason: string;
  evidence: string[];
  confidence: number;
};

type RawAiContradiction = {
  title: string;
  description: string;
  evidence: string[];
  confidence: number;
};

type RawAiReview = {
  summary: string;
  purpose: string;
  type: string;
  technologies: string[];
  inferred_state: string;
  state_evidence: string[];
  observed_features: RawAiObservedFeature[];
  contradictions: RawAiContradiction[];
  confidence: number;
  uncertainties: string[];
  suggested_tasks: RawAiSuggestedTask[];
};

function getOllamaConfig(): {
  url: string;
  model: string;
  think: OllamaThinkLevel;
} {
  const rawThink = process.env.OLLAMA_THINK?.trim().toLowerCase() || "low";

  const think: OllamaThinkLevel =
    rawThink === "false"
      ? false
      : rawThink === "medium"
        ? "medium"
        : rawThink === "high"
          ? "high"
          : rawThink === "max"
            ? "max"
            : "low";

  return {
    url:
      process.env.OLLAMA_URL?.trim() ||
      "http://localhost:11434/api/chat",
    model:
      process.env.OLLAMA_MODEL?.trim() ||
      "qwen3.5:4b",
    think,
  };
}

function buildInstructions(): string {
  return [
    "Tu es l'analyste technique de Project OS.",
    "",
    "Comprends le dépôt GitHub et le contexte Project OS fourni puis produis une analyse factuelle pour un développeur solo.",
    "",
    "Rôle des sources :",
    "1. Le contenu réel des fichiers sélectionnés est la preuve principale des comportements implémentés.",
    "2. README, documentation et configuration décrivent le projet mais ne remplacent pas une vérification du code.",
    "3. Les données Project OS (état, tâches, décisions, activités) sont des faits enregistrés sur le projet ; elles ne prouvent pas à elles seules que le code respecte encore ces éléments.",
    "4. La structure du dépôt, l'historique GitHub et les métadonnées servent de contexte secondaire.",
    "",
    "Ne confonds jamais ce que Project OS déclare avec ce que le code démontre.",
    "",
    "Règles d'analyse :",
    "- Ne considère jamais un nom de fichier, un dossier ou un commit comme preuve suffisante qu'une fonctionnalité existe.",
    "- Chaque fonctionnalité observée doit citer un fichier concret.",
    "- inferred_state décrit l'état réel estimé du projet, pas l'état administratif 'Importé depuis GitHub'.",
    "- technologies contient uniquement les technologies observables ou très solidement déduites.",
    "- observed_features contient 2 à 8 sous-systèmes réellement observés quand c'est possible.",
    "",
    "Règles de contradictions :",
    "- Détecte uniquement des contradictions substantielles entre les données Project OS et le code/documentation.",
    "- Exemples valides : une tâche encore ouverte alors que le comportement ciblé est clairement déjà implémenté ; une décision active qui décrit un comportement contredit par le code fourni ; un état administratif qui contredit fortement ce que montrent les fichiers.",
    "- Une simple absence, différence de vocabulaire ou différence de niveau de détail n'est pas une contradiction.",
    "- Une tâche ancienne peut rester valide même si une partie de son objectif existe déjà : ne signale une contradiction que si le conflit est concret.",
    "- Chaque contradiction doit fournir au moins deux éléments de preuve utiles, représentant les deux côtés du conflit.",
    "- Tu peux produire ZERO contradiction.",
    "- Maximum 5 contradictions.",
    "",
    "Règles de tâches :",
    "- Tu peux proposer ZERO tâche.",
    "- Une fonctionnalité absente n'est PAS automatiquement un problème.",
    "- Avant de proposer une tâche, vérifie dans le code fourni et dans les tâches Project OS qu'elle n'est pas déjà implémentée ou déjà enregistrée.",
    "- Ne propose jamais une amélioration générique sans problème concret.",
    "- Ne recrée pas une tâche existante sous un autre titre simplement pour la reformuler.",
    "- Si un problème est déjà une tâche TODO ou IN_PROGRESS, ne le repropose pas sauf si tu identifies un problème distinct et clairement documenté.",
    "- Une tâche DONE ne doit pas être reproposée sans une nouvelle preuve que le problème est revenu ou a régressé.",
    "- Une tâche doit décrire un problème réel et fournir au moins une preuve précise.",
    "- Les types autorisés sont : BUG, INCOMPLETE, DESIGN_GAP, REFACTOR, DOCUMENTATION, TEST.",
    "- TEST n'est pas justifié simplement parce qu'aucun test n'a été trouvé.",
    "- DESIGN_GAP n'est pas justifié simplement parce qu'une fonctionnalité n'existe pas.",
    "- Ne propose pas 'ajouter des notifications', 'gérer les branches', 'ajouter des tests', 'améliorer les performances' ou 'mettre à jour les dépendances' sans défaut précis observé.",
    "- Maximum 3 tâches. Il vaut mieux produire 0 tâche que d'en inventer.",
    "",
    "Réponse :",
    "- Réponds avec un objet JSON valide uniquement.",
    "- Aucun markdown, aucune phrase avant ou après le JSON.",
    "- Champs obligatoires : summary, purpose, type, technologies, inferred_state, state_evidence, observed_features, contradictions, confidence, uncertainties, suggested_tasks.",
    "- observed_features contient des objets {name, description, evidence}.",
    "- contradictions contient des objets {title, description, evidence, confidence}.",
    "- suggested_tasks contient des objets {title, task_kind, priority, problem, reason, evidence, confidence}.",
    "- confidence et les confiances de tâches sont entre 0 et 1.",
    "- priority est un entier de 1 à 5.",
    "",
    "Preuves :",
    "- Pour une preuve venant d'un fichier réellement fourni, cite le chemin exact du fichier, par exemple scripts/main.gd.",
    "- Pour une preuve venant de l'arbre du dépôt mais dont le contenu n'a pas été fourni, cite le chemin exact du fichier.",
    "- Pour une preuve provenant de Project OS, utilise exactement un préfixe : TASK:<id>, DECISION:<id>, ACTIVITY:<id> ou PROJECT_STATE, suivi si nécessaire de ' — ' puis de l'explication.",
    "- N'invente jamais un identifiant TASK, DECISION ou ACTIVITY : utilise uniquement ceux présents dans le contexte.",
    "",
    "Format JSON attendu :",
    "{",
    '  "summary": "string",',
    '  "purpose": "string",',
    '  "type": "string",',
    '  "technologies": ["string"],',
    '  "inferred_state": "string",',
    '  "state_evidence": ["string"],',
    '  "observed_features": [',
    '    {"name": "string", "description": "string", "evidence": ["string"]}',
    "  ],",
    '  "contradictions": [',
    '    {"title": "string", "description": "string", "evidence": ["string"], "confidence": 0.0}',
    "  ],",
    '  "confidence": 0.0,',
    '  "uncertainties": ["string"],',
    '  "suggested_tasks": [',
    '    {"title": "string", "task_kind": "BUG|INCOMPLETE|DESIGN_GAP|REFACTOR|DOCUMENTATION|TEST", "priority": 1, "problem": "string", "reason": "string", "evidence": ["string"], "confidence": 0.0}',
    "  ]",
    "}",
  ].join("\n");
}

function parseJsonObject(text: string): unknown | null {
  const trimmed = text.trim();

  const candidates = [trimmed];

  const fenced = trimmed.match(
    /\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i,
  );

  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function assertRawReview(value: unknown): RawAiReview {
  if (!value || typeof value !== "object") {
    throw new Error("La réponse IA n'est pas un objet JSON.");
  }

  const review = value as Partial<RawAiReview>;

  if (
    typeof review.summary !== "string" ||
    typeof review.purpose !== "string" ||
    typeof review.type !== "string" ||
    !Array.isArray(review.technologies) ||
    typeof review.inferred_state !== "string" ||
    !Array.isArray(review.state_evidence) ||
    !Array.isArray(review.observed_features) ||
    !Array.isArray(review.contradictions) ||
    !Array.isArray(review.uncertainties) ||
    !Array.isArray(review.suggested_tasks) ||
    typeof review.confidence !== "number" ||
    review.confidence < 0 ||
    review.confidence > 1
  ) {
    throw new Error("La réponse IA ne respecte pas la structure attendue.");
  }

  const suggestedTasks: RawAiSuggestedTask[] = review.suggested_tasks
    .filter(
      (task): task is RawAiSuggestedTask =>
        !!task &&
        typeof task === "object" &&
        typeof task.title === "string" &&
        typeof task.task_kind === "string" &&
        typeof task.priority === "number" &&
        typeof task.problem === "string" &&
        typeof task.reason === "string" &&
        Array.isArray(task.evidence) &&
        typeof task.confidence === "number" &&
        task.confidence >= 0 &&
        task.confidence <= 1 &&
        task.priority >= 1 &&
        task.priority <= 5 &&
        task.title.trim().length > 0 &&
        task.problem.trim().length > 0 &&
        task.reason.trim().length > 0 &&
        task.evidence.length > 0,
    )
    .slice(0, 3);

  const contradictions: RawAiContradiction[] = review.contradictions
    .filter(
      (contradiction): contradiction is RawAiContradiction =>
        !!contradiction &&
        typeof contradiction === "object" &&
        typeof contradiction.title === "string" &&
        typeof contradiction.description === "string" &&
        Array.isArray(contradiction.evidence) &&
        typeof contradiction.confidence === "number" &&
        contradiction.confidence >= 0 &&
        contradiction.confidence <= 1 &&
        contradiction.title.trim().length > 0 &&
        contradiction.description.trim().length > 0 &&
        contradiction.evidence.length >= 2,
    )
    .slice(0, 5);

  const observedFeatures = review.observed_features
    .filter(
      (feature): feature is RawAiObservedFeature =>
        !!feature &&
        typeof feature === "object" &&
        typeof feature.name === "string" &&
        typeof feature.description === "string" &&
        Array.isArray(feature.evidence) &&
        feature.name.trim().length > 0,
    )
    .slice(0, 8);

  return {
    summary: review.summary,
    purpose: review.purpose,
    type: review.type,
    technologies: review.technologies.filter(
      (item): item is string => typeof item === "string",
    ),
    inferred_state: review.inferred_state,
    state_evidence: review.state_evidence.filter(
      (item): item is string => typeof item === "string",
    ),
    observed_features: observedFeatures,
    contradictions,
    confidence: review.confidence,
    uncertainties: review.uncertainties.filter(
      (item): item is string => typeof item === "string",
    ),
    suggested_tasks: suggestedTasks,
  };
}

function normalizeEvidenceText(value: string): string {
  return value
    .trim()
    .replace(/^\.\//, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

function getBasename(value: string): string {
  const normalized = normalizeEvidenceText(value);
  return normalized.split("/").at(-1) ?? normalized;
}

function resolveEvidence(
  evidence: string,
  context: ProjectAiContext,
): AiEvidence {
  const normalized = normalizeEvidenceText(evidence);
  const projectOs = context.project_os;

  const taskMarker = evidence.match(/^TASK:([a-z0-9-]+)/i);
  if (taskMarker) {
    const task = projectOs.tasks.find(
      (item) => item.id.toLowerCase() === taskMarker[1].toLowerCase(),
    );
    if (task) {
      return {
        kind: "PROJECT_OS",
        source:
          "Project OS — tâche : " +
          task.title +
          " [" +
          task.status +
          "]",
        claim:
          evidence
            .replace(/^TASK:[a-z0-9-]+\s*(?:—|[-:])?\s*/i, "")
            .trim() || evidence.trim(),
      };
    }
  }

  const decisionMarker = evidence.match(/^DECISION:([a-z0-9-]+)/i);
  if (decisionMarker) {
    const decision = projectOs.decisions.find(
      (item) => item.id.toLowerCase() === decisionMarker[1].toLowerCase(),
    );
    if (decision) {
      return {
        kind: "PROJECT_OS",
        source:
          "Project OS — décision : " +
          decision.title +
          " [" +
          decision.status +
          "]",
        claim:
          evidence
            .replace(/^DECISION:[a-z0-9-]+\s*(?:—|[-:])?\s*/i, "")
            .trim() || evidence.trim(),
      };
    }
  }

  const activityMarker = evidence.match(/^ACTIVITY:([a-z0-9-]+)/i);
  if (activityMarker) {
    const activity = projectOs.recent_activities.find(
      (item) => item.id.toLowerCase() === activityMarker[1].toLowerCase(),
    );
    if (activity) {
      return {
        kind: "PROJECT_OS",
        source:
          "Project OS — activité : " +
          activity.title +
          " [" +
          activity.type +
          "]",
        claim:
          evidence
            .replace(/^ACTIVITY:[a-z0-9-]+\s*(?:—|[-:])?\s*/i, "")
            .trim() || evidence.trim(),
      };
    }
  }

  if (/^PROJECT_STATE\b/i.test(evidence)) {
    return {
      kind: "PROJECT_OS",
      source:
        "Project OS — état : " +
        (projectOs.project.current_state ?? "Non défini"),
      claim:
        evidence
          .replace(/^PROJECT_STATE\s*(?:—|[-:])?\s*/i, "")
          .trim() || evidence.trim(),
    };
  }

  const projectOsMatches = [
    ...projectOs.tasks.map((item) => ({
      label: item.title,
      source:
        "Project OS — tâche : " +
        item.title +
        " [" +
        item.status +
        "]",
    })),
    ...projectOs.decisions.map((item) => ({
      label: item.title,
      source:
        "Project OS — décision : " +
        item.title +
        " [" +
        item.status +
        "]",
    })),
    ...projectOs.recent_activities.map((item) => ({
      label: item.title,
      source:
        "Project OS — activité : " +
        item.title +
        " [" +
        item.type +
        "]",
    })),
  ]
    .filter((item) => normalizeEvidenceText(item.label).length >= 8)
    .sort(
      (a, b) =>
        normalizeEvidenceText(b.label).length -
        normalizeEvidenceText(a.label).length,
    );

  const projectOsMatch = projectOsMatches.find((item) =>
    normalized.includes(normalizeEvidenceText(item.label)),
  );

  if (projectOsMatch) {
    return {
      kind: "PROJECT_OS",
      source: projectOsMatch.source,
      claim: evidence.trim(),
    };
  }

  const directSources = [
    ...context.selected_files.map((file) => file.path),
    ...(context.readme ? ["README"] : []),
    ...(context.package_json ? ["package.json"] : []),
  ].map(normalizeEvidenceText);

  const treeSources = context.repository_tree.map(normalizeEvidenceText);

  const directMatch = [...directSources]
    .sort((a, b) => b.length - a.length)
    .find((source) => normalized.includes(source));

  if (directMatch) {
    return {
      kind: "DIRECT",
      source: directMatch === "readme" ? "README" : directMatch,
      claim: evidence.trim(),
    };
  }

  const fileToken = normalized.match(
    /[a-z0-9_./-]+\.(?:gd|tscn|tres|ts|tsx|js|jsx|json|md|scene|toml|yaml|yml|cfg)/i,
  )?.[0];

  if (fileToken) {
    const directByName = directSources.filter(
      (source) => getBasename(source) === getBasename(fileToken),
    );

    if (directByName.length === 1) {
      return {
        kind: "DIRECT",
        source: directByName[0],
        claim: evidence.trim(),
      };
    }

    const treeByName = treeSources.filter(
      (source) => getBasename(source) === getBasename(fileToken),
    );

    if (treeByName.length === 1) {
      return {
        kind: "INDIRECT",
        source: treeByName[0],
        claim: evidence.trim(),
      };
    }
  }

  const treeMatch = [...treeSources]
    .sort((a, b) => b.length - a.length)
    .find((source) => normalized.includes(source));

  if (treeMatch) {
    return {
      kind: "INDIRECT",
      source: treeMatch,
      claim: evidence.trim(),
    };
  }

  if (normalized.includes("readme") && context.readme) {
    return {
      kind: "DIRECT",
      source: "README",
      claim: evidence.trim(),
    };
  }

  if (normalized.includes("package.json") && context.package_json) {
    return {
      kind: "DIRECT",
      source: "package.json",
      claim: evidence.trim(),
    };
  }

  return {
    kind: "INDIRECT",
    source: "Déduction non rattachée à un fichier sélectionné",
    claim: evidence.trim(),
  };
}

function decorateReviewEvidence(
  raw: RawAiReview,
  context: ProjectAiContext,
): AiReview {
  return {
    summary: raw.summary,
    purpose: raw.purpose,
    type: raw.type,
    technologies: raw.technologies,
    inferred_state: raw.inferred_state,
    state_evidence: raw.state_evidence.map((item) =>
      resolveEvidence(item, context),
    ),
    observed_features: raw.observed_features.map((feature) => ({
      name: feature.name,
      description: feature.description,
      evidence: feature.evidence.map((item) =>
        resolveEvidence(item, context),
      ),
    })),
    contradictions: raw.contradictions.map((contradiction) => ({
      title: contradiction.title,
      description: contradiction.description,
      evidence: contradiction.evidence.map((item) =>
        resolveEvidence(item, context),
      ),
      confidence: contradiction.confidence,
    })),
    confidence: raw.confidence,
    uncertainties: raw.uncertainties,
    suggested_tasks: raw.suggested_tasks.map((task) => ({
      title: task.title,
      task_kind: task.task_kind,
      priority: task.priority,
      problem: task.problem,
      reason: task.reason,
      evidence: task.evidence.map((item) =>
        resolveEvidence(item, context),
      ),
      confidence: task.confidence,
    })),
  };
}

async function callOllama(
  url: string,
  body: Record<string, unknown>,
): Promise<OllamaChatResponse> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Impossible de joindre Ollama sur " +
        url +
        ". Vérifie qu'Ollama est lancé et que le modèle est installé.",
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      "Ollama API " +
        response.status +
        " : " +
        errorBody.slice(0, 500),
    );
  }

  return (await response.json()) as OllamaChatResponse;
}

async function requestStructuredReview(
  url: string,
  model: string,
  think: OllamaThinkLevel,
  input: string,
  instructions: string,
): Promise<OllamaChatResponse> {
  return callOllama(url, {
    model,
    stream: false,
    think,
    format: "json",
    messages: [
      {
        role: "system",
        content: instructions,
      },
      {
        role: "user",
        content:
          "Analyse ce dépôt GitHub pour Project OS.\n\n" +
          input,
      },
    ],
    options: {
      temperature: 0,
    },
  });
}

async function requestFallbackReview(
  url: string,
  model: string,
  input: string,
  instructions: string,
): Promise<OllamaChatResponse> {
  return callOllama(url, {
    model,
    stream: false,
    think: false,
    format: "json",
    messages: [
      {
        role: "system",
        content: instructions,
      },
      {
        role: "user",
        content:
          "Réponds uniquement avec le JSON attendu. Analyse ce dépôt GitHub.\n\n" +
          input,
      },
    ],
    options: {
      temperature: 0,
    },
  });
}

function tryParseAiReview(
  content: string,
  context: ProjectAiContext,
): AiReview | null {
  if (!content.trim()) {
    return null;
  }

  const parsed = parseJsonObject(content);

  if (!parsed) {
    return null;
  }

  try {
    return decorateReviewEvidence(assertRawReview(parsed), context);
  } catch {
    return null;
  }
}

export async function reviewProjectWithAI(
  context: ProjectAiContext,
): Promise<AiReview> {
  const { url, model, think } = getOllamaConfig();
  const instructions = buildInstructions();
  const input = JSON.stringify(context);

  const firstResponse = await requestStructuredReview(
    url,
    model,
    think,
    input,
    instructions,
  );

  const firstContent = firstResponse.message?.content?.trim() ?? "";
  const firstReview = tryParseAiReview(firstContent, context);

  if (firstReview) {
    return firstReview;
  }

  const thinking = firstResponse.message?.thinking?.trim() ?? "";

  if (thinking) {
    const thinkingReview = tryParseAiReview(thinking, context);

    if (thinkingReview) {
      return thinkingReview;
    }
  }

  const fallbackResponse = await requestFallbackReview(
    url,
    model,
    input,
    [
      instructions,
      "",
      "Mode de secours : produis un JSON compact et strict.",
      "N'ajoute aucune explication, aucun markdown et aucune réflexion dans la réponse.",
      "Limite les observed_features à 5, les contradictions à 3 et les suggested_tasks à 2.",
      "Les champs evidence doivent rester courts et précis.",
    ].join("\n"),
  );

  const fallbackContent = fallbackResponse.message?.content?.trim() ?? "";
  const fallbackReview = tryParseAiReview(
    fallbackContent,
    context,
  );

  if (fallbackReview) {
    return fallbackReview;
  }

  const reason =
    fallbackResponse.done_reason
      ? " (done_reason: " + fallbackResponse.done_reason + ")"
      : "";

  throw new Error(
    "Ollama a répondu sans JSON exploitable" +
      reason +
      ". Le modèle a peut-être tronqué ou mal structuré sa réponse.",
  );
}
