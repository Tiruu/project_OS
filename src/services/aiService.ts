import "dotenv/config";

import type {
  AiEvidence,
  AiReview,
  AiSuggestedTask,
  AiTaskKind,
} from "../types/aiReview.js";
import type { GithubRepositoryContext } from "./githubContextService.js";

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

type RawAiReview = {
  summary: string;
  purpose: string;
  type: string;
  technologies: string[];
  inferred_state: string;
  state_evidence: string[];
  observed_features: RawAiObservedFeature[];
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
    "Comprends le dépôt GitHub fourni puis produis une analyse factuelle pour un développeur solo.",
    "",
    "Sources par ordre de confiance :",
    "1. contenu réel des fichiers sélectionnés",
    "2. README et documentation",
    "3. structure du dépôt",
    "4. configuration",
    "5. historique GitHub",
    "6. métadonnées",
    "7. données déjà stockées dans Project OS",
    "",
    "Règles d'analyse :",
    "- Ne considère jamais un nom de fichier, un dossier ou un commit comme preuve suffisante qu'une fonctionnalité existe.",
    "- Chaque fonctionnalité observée doit citer un fichier concret.",
    "- inferred_state décrit l'état réel estimé du projet, pas l'état administratif 'Importé depuis GitHub'.",
    "- technologies contient uniquement les technologies observables ou très solidement déduites.",
    "- observed_features contient 2 à 8 sous-systèmes réellement observés quand c'est possible.",
    "",
    "Règles de tâches :",
    "- Tu peux proposer ZERO tâche.",
    "- Une fonctionnalité absente n'est PAS automatiquement un problème.",
    "- Avant de proposer une tâche, vérifie dans le code fourni qu'elle n'est pas déjà implémentée.",
    "- Ne propose jamais une amélioration générique sans problème concret.",
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
    "- Champs obligatoires : summary, purpose, type, technologies, inferred_state, state_evidence, observed_features, confidence, uncertainties, suggested_tasks.",
    "- observed_features contient des objets {name, description, evidence}.",
    "- suggested_tasks contient des objets {title, task_kind, priority, problem, reason, evidence, confidence}.",
    "- confidence et les confiances de tâches sont entre 0 et 1.",
    "- priority est un entier de 1 à 5.",
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
  context: GithubRepositoryContext,
): AiEvidence {
  const normalized = normalizeEvidenceText(evidence);

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
  context: GithubRepositoryContext,
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

export async function reviewProjectWithAI(
  context: GithubRepositoryContext,
): Promise<AiReview> {
  const { url, model, think } = getOllamaConfig();
  const instructions = buildInstructions();
  const input = JSON.stringify(context);

  let data = await requestStructuredReview(
    url,
    model,
    think,
    input,
    instructions,
  );

  let content = data.message?.content?.trim() ?? "";

  if (!content) {
    const thinking = data.message?.thinking?.trim() ?? "";

    if (thinking) {
      const thinkingJson = parseJsonObject(thinking);

      if (thinkingJson) {
        try {
          const rawReview = assertRawReview(thinkingJson);
          return decorateReviewEvidence(rawReview, context);
        } catch {
          // Continue to the fallback request.
        }
      }
    }

    data = await requestFallbackReview(
      url,
      model,
      input,
      instructions,
    );

    content = data.message?.content?.trim() ?? "";
  }

  if (!content) {
    const reason = data.done_reason
      ? " (done_reason: " + data.done_reason + ")"
      : "";

    throw new Error(
      "Ollama n'a renvoyé aucun contenu exploitable" +
        reason +
        ".",
    );
  }

  const parsed = parseJsonObject(content);

  if (!parsed) {
    throw new Error(
      "Ollama a répondu sans JSON exploitable.",
    );
  }

  return decorateReviewEvidence(assertRawReview(parsed), context);
}
