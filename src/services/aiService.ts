import "dotenv/config";

import type {
  AiEvidence,
  AiObservedFeature,
  AiReview,
  AiSuggestedTask,
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
    "Règles de preuve :",
    "- DIRECT signifie que le fichier, texte ou élément cité a réellement été fourni dans les données.",
    "- INDIRECT signifie que l'élément est déduit d'une preuve DIRECTE, mais que son contenu n'a pas été fourni.",
    "- N'utilise jamais DIRECT pour un fichier dont tu n'as vu que le nom ou une référence.",
    "- Pour une preuve INDIRECTE, explique clairement le lien logique avec la preuve DIRECTE.",
    "- N'affirme jamais avoir lu le contenu d'un fichier uniquement parce qu'un autre fichier le référence.",
    "- Une conclusion de qualité comme 'manque de modularité', 'manque de tests' ou 'architecture insuffisante' doit rester une incertitude sauf si le code fourni contient des éléments concrets qui la démontrent.",
    "",
    "Règles d'analyse :",
    "- Ne considère jamais un nom de fichier, un dossier ou un commit comme preuve suffisante qu'une fonctionnalité existe.",
    "- Chaque fonctionnalité observée doit citer un fichier concret.",
    "- inferred_state décrit l'état réel estimé du projet, pas l'état administratif 'Importé depuis GitHub'.",
    "- Ne transforme pas l'absence de tests, de modularité ou d'une fonctionnalité en défaut sans preuve concrète.",
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
    "- state_evidence et evidence sont des objets {kind, source, claim}.",
    "- kind vaut uniquement DIRECT ou INDIRECT.",
    "- source doit être une référence précise.",
    "- claim doit expliquer précisément ce que la preuve démontre.",
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
    '  "state_evidence": [{"kind": "DIRECT|INDIRECT", "source": "string", "claim": "string"}],',
    '  "observed_features": [',
    '    {"name": "string", "description": "string", "evidence": [{"kind": "DIRECT|INDIRECT", "source": "string", "claim": "string"}]}',
    "  ],",
    '  "confidence": 0.0,',
    '  "uncertainties": ["string"],',
    '  "suggested_tasks": [',
    '    {"title": "string", "task_kind": "BUG|INCOMPLETE|DESIGN_GAP|REFACTOR|DOCUMENTATION|TEST", "priority": 1, "problem": "string", "reason": "string", "evidence": [{"kind": "DIRECT|INDIRECT", "source": "string", "claim": "string"}], "confidence": 0.0}',
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

const AI_EVIDENCE_KINDS = new Set(["DIRECT", "INDIRECT"]);
const AI_TASK_KINDS = new Set([
  "BUG",
  "INCOMPLETE",
  "DESIGN_GAP",
  "REFACTOR",
  "DOCUMENTATION",
  "TEST",
]);

function parseEvidence(value: unknown): AiEvidence | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const evidence = value as Partial<AiEvidence>;

  if (
    typeof evidence.kind !== "string" ||
    !AI_EVIDENCE_KINDS.has(evidence.kind) ||
    typeof evidence.source !== "string" ||
    typeof evidence.claim !== "string" ||
    evidence.source.trim().length === 0 ||
    evidence.claim.trim().length === 0
  ) {
    return null;
  }

  return {
    kind: evidence.kind as AiEvidence["kind"],
    source: evidence.source.trim(),
    claim: evidence.claim.trim(),
  };
}

function parseObservedFeatures(value: unknown): AiObservedFeature[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const feature = item as Partial<AiObservedFeature>;

      if (
        typeof feature.name !== "string" ||
        typeof feature.description !== "string" ||
        !Array.isArray(feature.evidence)
      ) {
        return null;
      }

      const evidence = feature.evidence
        .map(parseEvidence)
        .filter((item): item is AiEvidence => item !== null);

      if (
        feature.name.trim().length === 0 ||
        feature.description.trim().length === 0 ||
        evidence.length === 0
      ) {
        return null;
      }

      return {
        name: feature.name.trim(),
        description: feature.description.trim(),
        evidence: evidence.slice(0, 4),
      };
    })
    .filter((item): item is AiObservedFeature => item !== null)
    .slice(0, 8);
}

function parseSuggestedTasks(value: unknown): AiSuggestedTask[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const task = item as Partial<AiSuggestedTask>;

      if (
        typeof task.title !== "string" ||
        typeof task.task_kind !== "string" ||
        typeof task.priority !== "number" ||
        typeof task.problem !== "string" ||
        typeof task.reason !== "string" ||
        !Array.isArray(task.evidence) ||
        typeof task.confidence !== "number"
      ) {
        return null;
      }

      const evidence = task.evidence
        .map(parseEvidence)
        .filter((item): item is AiEvidence => item !== null);

      if (
        !AI_TASK_KINDS.has(task.task_kind) ||
        task.title.trim().length === 0 ||
        task.problem.trim().length === 0 ||
        task.reason.trim().length === 0 ||
        task.priority < 1 ||
        task.priority > 5 ||
        task.confidence < 0 ||
        task.confidence > 1 ||
        evidence.length === 0
      ) {
        return null;
      }

      return {
        title: task.title.trim(),
        task_kind: task.task_kind as AiSuggestedTask["task_kind"],
        priority: task.priority,
        problem: task.problem.trim(),
        reason: task.reason.trim(),
        evidence: evidence.slice(0, 4),
        confidence: task.confidence,
      };
    })
    .filter((item): item is AiSuggestedTask => item !== null)
    .slice(0, 3);
}

function assertReview(value: unknown): AiReview {
  if (!value || typeof value !== "object") {
    throw new Error("La réponse IA n'est pas un objet JSON.");
  }

  const review = value as Partial<AiReview>;

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

  const stateEvidence = review.state_evidence
    .map(parseEvidence)
    .filter((item): item is AiEvidence => item !== null);

  return {
    summary: review.summary.trim(),
    purpose: review.purpose.trim(),
    type: review.type.trim(),
    technologies: review.technologies.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    ),
    inferred_state: review.inferred_state.trim(),
    state_evidence: stateEvidence.slice(0, 6),
    observed_features: parseObservedFeatures(review.observed_features),
    confidence: review.confidence,
    uncertainties: review.uncertainties.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    ),
    suggested_tasks: parseSuggestedTasks(review.suggested_tasks),
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
          return assertReview(thinkingJson);
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

  return assertReview(parsed);
}
