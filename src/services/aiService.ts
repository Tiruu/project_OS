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

type GeminiInteractionResponse = {
  status?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type AiProvider = "ollama" | "gemini";


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


function getAiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "gemini"
    ? "gemini"
    : "ollama";
}

function getGeminiConfig(): {
  apiKey: string;
  model: string;
  fallbackModel: string;
  thinkingLevel: "minimal" | "low" | "medium" | "high";
} {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY est absent. Ajoute une clé Gemini dans ton .env.",
    );
  }

  const rawThinkingLevel =
    process.env.GEMINI_THINKING_LEVEL?.trim().toLowerCase() ||
    "minimal";

  const thinkingLevel =
    rawThinkingLevel === "low" ||
    rawThinkingLevel === "medium" ||
    rawThinkingLevel === "high"
      ? rawThinkingLevel
      : "minimal";

  return {
    apiKey,
    model:
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-3.6-flash",
    fallbackModel:
      process.env.GEMINI_FALLBACK_MODEL?.trim() ||
      "gemini-3.5-flash-lite",
    thinkingLevel,
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
    "- La présence de dist/, build/, bin/ ou d'autres artefacts compilés ne prouve jamais que le projet est en production ou déployé.",
    "- N'utilise 'production', 'déployé' ou équivalent que si des preuves spécifiques de déploiement sont présentes.",
    "- La présence ou l'absence d'un artefact dans le contexte fourni ne prouve jamais à elle seule son existence ou son absence dans le projet réel.",
    "- Remplace les affirmations d'absence par des formulations limitées au contexte, par exemple 'non observé dans les fichiers fournis'.",
    "- N'emploie jamais 'complet', 'manquant', 'aucun', 'absent' ou équivalent pour conclure sur le projet entier lorsque seule une sélection de fichiers ou l'arborescence a été fournie.",

    "- technologies contient uniquement les technologies observables ou très solidement déduites.",
    "- observed_features contient 2 à 8 sous-systèmes réellement observés quand c'est possible.",
    "- purpose décrit le but du projet analysé, jamais le but de cette analyse.",
    "- type décrit la nature du projet analysé (par exemple game, bot, library), jamais 'analysis' ou le type de la réponse.",
    "- Si Project OS fournit déjà project.purpose et project.type, réutilise ces valeurs pour purpose et type ; ne les remplace pas par une description de ton travail d'analyse.",
    "",
    "Règles de contradictions :",
    "- Détecte uniquement des contradictions substantielles entre les données Project OS et le code/documentation.",
    "- Exemples valides : une tâche encore ouverte alors que le comportement ciblé est clairement déjà implémenté ; une décision active qui décrit un comportement contredit par le code fourni ; un état administratif qui contredit fortement ce que montrent les fichiers.",
    "- Une simple absence, différence de vocabulaire ou différence de niveau de détail n'est pas une contradiction.",
    "- Une tâche ancienne peut rester valide même si une partie de son objectif existe déjà : ne signale une contradiction que si le conflit est concret.",
    "- Une divergence entre documentation et code n'est pas automatiquement un bug : elle peut simplement signifier que la documentation est obsolète.",
    "- Classe une divergence documentation/code comme contradiction ou point à vérifier tant qu'un défaut du comportement n'est pas démontré.",
    "- Une tâche de type BUG n'est justifiée que si le code montre un comportement incorrect par rapport à une règle, une décision ou une spécification suffisamment explicite ; une documentation obsolète seule ne suffit pas.",

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
    "- BUG exige une preuve directe du comportement incorrect ; une simple divergence documentaire ne suffit pas.",
    "- DOCUMENTATION est approprié lorsqu'une documentation historique ou de référence ne correspond plus au comportement actuel sans démontrer que le code est faux.",
    "- INCOMPLETE exige une exigence explicite non satisfaite ; ne déduis pas cette exigence de la seule absence d'un fichier.",

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
    "- Pour une contradiction entre une tâche et le code, cite explicitement TASK:<id> comme preuve Project OS et un chemin de fichier comme preuve du code.",
    "- Pour une contradiction entre une décision et le code, cite explicitement DECISION:<id> et un chemin de fichier.",
    "- Pour une contradiction entre une activité et le code, cite explicitement ACTIVITY:<id> et un chemin de fichier.",

    "- N'invente jamais un identifiant TASK, DECISION ou ACTIVITY : utilise uniquement ceux présents dans le contexte.",
    "",
    "Priorité sémantique :",
    "- Si purpose ou type existent dans Project OS, ils décrivent l'identité du projet et non l'analyse.",
    "- Si aucune preuve directe ne permet de confirmer un bug, ne le présente pas comme un bug confirmé ; utilise une formulation prudente dans inferred_state ou uncertainties.",
    "- Si un état est seulement partiellement observable, préfère 'non déterminable à partir du contexte fourni' à une conclusion absolue.",
    "- Ne dis jamais qu'un système est 'fonctionnel', 'opérationnel', 'fiable' ou 'correct' uniquement parce que son code est présent.",
    "- Sans preuve d'exécution, de test, de log ou de comportement observé, utilise 'implémenté', 'présent dans le code' ou 'observable dans les fichiers fournis'.",
    "- Ne transforme pas la présence d'une implémentation en preuve qu'elle fonctionne correctement en runtime.",
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
  const references = projectOs.reference_index;

  const taskMarker = evidence.match(/^TASK:([a-z0-9-]+)/i);
  if (taskMarker) {
    const task = references.tasks.find(
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
    const decision = references.decisions.find(
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
    const activity = references.activities.find(
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
    ...references.tasks.map((item) => ({
      label: item.title,
      source:
        "Project OS — tâche : " +
        item.title +
        " [" +
        item.status +
        "]",
    })),
    ...references.decisions.map((item) => ({
      label: item.title,
      source:
        "Project OS — décision : " +
        item.title +
        " [" +
        item.status +
        "]",
    })),
    ...references.activities.map((item) => ({
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

function isImportPlaceholder(
  value: string | null | undefined,
): boolean {
  if (!value?.trim()) {
    return false;
  }

  return /importé depuis github|imported from github|projet importé|project imported/i.test(
    value,
  );
}

function normalizeTaskSearchText(value: string): string[] {
  const stopWords = new Set([
    "avec",
    "dans",
    "pour",
    "entre",
    "comme",
    "alors",
    "cette",
    "cette",
    "code",
    "projet",
    "système",
    "systeme",
    "doit",
    "être",
    "etre",
    "faire",
    "permet",
    "permettre",
    "actif",
    "active",
  ]);

  return normalizeEvidenceText(value)
    .replace(/[^a-z0-9à-ÿ\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .filter((token) => !stopWords.has(token));
}

function tasksOverlap(
  taskTitle: string,
  contradiction: AiEvidence[],
): boolean {
  const taskTokens = new Set(
    normalizeTaskSearchText(taskTitle),
  );

  if (taskTokens.size === 0) {
    return false;
  }

  const contradictionText = contradiction
    .map((item) => item.claim)
    .join(" ");

  const contradictionTokens = new Set(
    normalizeTaskSearchText(contradictionText),
  );

  let overlap = 0;

  for (const token of taskTokens) {
    if (contradictionTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap >= 2 ||
    overlap / taskTokens.size >= 0.6;
}

function buildDeterministicTask(
  contradiction: AiReview["contradictions"][number],
  context: ProjectAiContext,
): AiSuggestedTask | null {
  if (contradiction.confidence < 0.85) {
    return null;
  }

  const hasProjectOsEvidence = contradiction.evidence.some(
    (item) => item.kind === "PROJECT_OS",
  );
  const hasDirectEvidence = contradiction.evidence.some(
    (item) => item.kind === "DIRECT",
  );

  if (!hasProjectOsEvidence || !hasDirectEvidence) {
    return null;
  }

  const projectOsSources = contradiction.evidence.filter(
    (item) => item.kind === "PROJECT_OS",
  );

  const isDecisionContradiction = projectOsSources.some(
    (item) =>
      item.source.toLowerCase().includes("décision") ||
      item.source.toLowerCase().includes("decision"),
  );

  if (!isDecisionContradiction) {
    return null;
  }

  const activeTasks = context.project_os.tasks.filter(
    (task) =>
      task.status === "TODO" ||
      task.status === "IN_PROGRESS",
  );

  if (
    activeTasks.some((task) =>
      tasksOverlap(task.title, contradiction.evidence),
    )
  ) {
    return null;
  }

  const title =
    "Résoudre la contradiction : " +
    contradiction.title.trim();

  return {
    title: title.slice(0, 180),
    task_kind: "BUG",
    priority: contradiction.confidence >= 0.95 ? 1 : 2,
    problem: contradiction.description,
    reason:
      "Proposition déterministe générée à partir d'une contradiction forte entre une décision Project OS active et le code directement observé.",
    evidence: contradiction.evidence,
    confidence: Math.min(1, contradiction.confidence),
  };
}

function decorateReviewEvidence(
  raw: RawAiReview,
  context: ProjectAiContext,
): AiReview {
  const projectPurpose =
    context.project_os.project.purpose?.trim();
  const projectDescription =
    context.project_os.project.description?.trim();
  const repositoryDescription =
    context.repository.description?.trim();
  const projectType =
    context.project_os.project.type?.trim();
  const projectTechnologies =
    context.project_os.project.technologies.filter(Boolean);

  const validProjectPurpose =
    projectPurpose && !isImportPlaceholder(projectPurpose)
      ? projectPurpose
      : null;

  const validProjectDescription =
    projectDescription && !isImportPlaceholder(projectDescription)
      ? projectDescription
      : null;

  const validRepositoryDescription =
    repositoryDescription && !isImportPlaceholder(repositoryDescription)
      ? repositoryDescription
      : null;

  const purpose =
    validProjectPurpose ||
    validProjectDescription ||
    validRepositoryDescription ||
    (
      isImportPlaceholder(raw.purpose)
        ? "But non déterminé à partir du contexte fourni."
        : raw.purpose
    );

  const review: AiReview = {
    summary: raw.summary,
    purpose,
    type: projectType || raw.type,
    technologies:
      projectTechnologies.length > 0
        ? projectTechnologies
        : raw.technologies,
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

  for (const contradiction of review.contradictions) {
    if (review.suggested_tasks.length >= 3) {
      break;
    }

    const deterministicTask = buildDeterministicTask(
      contradiction,
      context,
    );

    if (!deterministicTask) {
      continue;
    }

    const duplicate = review.suggested_tasks.some(
      (task) =>
        task.title.toLowerCase() ===
          deterministicTask.title.toLowerCase() ||
        tasksOverlap(task.title, contradiction.evidence),
    );

    if (!duplicate) {
      review.suggested_tasks.push(deterministicTask);
    }
  }

  return review;
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

function buildCompactAiInput(context: ProjectAiContext): string {
  return JSON.stringify({
    repository: context.repository,
    repository_tree: context.repository_tree.slice(0, 120),
    selected_files: context.selected_files.slice(0, 6).map((file) => ({
      path: file.path,
      reason: file.reason,
      content: file.content.slice(0, 4500),
    })),
    readme: context.readme
      ? context.readme.slice(0, 5000)
      : null,
    package_json: context.package_json,
    project_os: {
      project: context.project_os.project,
      active_tasks: context.project_os.active_tasks,
      active_decisions: context.project_os.active_decisions,
      tasks: context.project_os.tasks.slice(0, 10),
      decisions: context.project_os.decisions.slice(0, 8),
      recent_activities: context.project_os.recent_activities.slice(0, 12),
      reference_index: context.project_os.reference_index,
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

const AI_REVIEW_JSON_SCHEMA = {
  type: "object",
  required: [
    "summary",
    "purpose",
    "type",
    "technologies",
    "inferred_state",
    "state_evidence",
    "observed_features",
    "contradictions",
    "confidence",
    "uncertainties",
    "suggested_tasks",
  ],
  properties: {
    summary: { type: "string" },
    purpose: { type: "string" },
    type: { type: "string" },
    technologies: { type: "array", items: { type: "string" } },
    inferred_state: { type: "string" },
    state_evidence: { type: "array", items: { type: "string" } },
    observed_features: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "description", "evidence"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "description", "evidence", "confidence"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
        },
      },
    },
    confidence: { type: "number" },
    uncertainties: { type: "array", items: { type: "string" } },
    suggested_tasks: {
      type: "array",
      items: {
        type: "object",
        required: [
          "title",
          "task_kind",
          "priority",
          "problem",
          "reason",
          "evidence",
          "confidence",
        ],
        properties: {
          title: { type: "string" },
          task_kind: {
            type: "string",
            enum: [
              "BUG",
              "INCOMPLETE",
              "DESIGN_GAP",
              "REFACTOR",
              "DOCUMENTATION",
              "TEST",
            ],
          },
          priority: { type: "integer" },
          problem: { type: "string" },
          reason: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

let lastGeminiRequestAt = 0;
const GEMINI_MIN_REQUEST_INTERVAL_MS = 12_500;

async function callGemini(
  apiKey: string,
  model: string,
  thinkingLevel: "minimal" | "low" | "medium" | "high",
  input: string,
  instructions: string,
  responseSchema: object = AI_REVIEW_JSON_SCHEMA,
): Promise<GeminiInteractionResponse> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/interactions";

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        input,
        system_instruction: instructions,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: responseSchema,
        },
        generation_config: {
          thinking_level: thinkingLevel,
        },
        store: false,
      }),
    });
  } catch {
    throw new Error(
      "Impossible de joindre l'API Gemini Interactions. Vérifie ta connexion et ta clé GEMINI_API_KEY.",
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();

    if (response.status === 503) {
      throw new Error(
        "GEMINI_SERVICE_UNAVAILABLE:" + errorBody.slice(0, 500),
      );
    }

    if (response.status === 429) {
      const retryMatch = errorBody.match(
        /retry in ([0-9]+(?:\.[0-9]+)?)s/i,
      );
      const retrySeconds = retryMatch
        ? Number.parseFloat(retryMatch[1])
        : 15;

      throw new Error(
        "GEMINI_RATE_LIMIT:" +
          retrySeconds +
          ":" +
          errorBody.slice(0, 500),
      );
    }

    throw new Error(
      "Gemini API " +
        response.status +
        " : " +
        errorBody.slice(0, 500),
    );
  }

  return (await response.json()) as GeminiInteractionResponse;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithRetry(
  apiKey: string,
  model: string,
  thinkingLevel: "minimal" | "low" | "medium" | "high",
  input: string,
  instructions: string,
  retryRateLimit = false,
): Promise<GeminiInteractionResponse> {
  const delays = [0, 1500, 3500, 7000];

  let lastError: unknown = null;
  let rateLimitRetries = 0;

  for (const delay of delays) {
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      return await callGemini(
        apiKey,
        model,
        thinkingLevel,
        input,
        instructions,
      );
    } catch (error) {
      lastError = error;

      if (
        error instanceof Error &&
        error.message.startsWith("GEMINI_RATE_LIMIT:")
      ) {
        if (!retryRateLimit || rateLimitRetries >= 1) {
          throw new Error(
            "GEMINI_RATE_LIMIT_EXHAUSTED:" +
              error.message.slice("GEMINI_RATE_LIMIT:".length),
          );
        }

        const parts = error.message.split(":");
        const retrySeconds = Number.parseFloat(parts[1] || "15");

        rateLimitRetries += 1;
        await sleep(
          Math.max(1000, Math.ceil(retrySeconds * 1000) + 250),
        );
        continue;
      }

      if (
        !(
          error instanceof Error &&
          error.message.startsWith("GEMINI_SERVICE_UNAVAILABLE:")
        )
      ) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini reste indisponible après plusieurs tentatives.");
}


function getGeminiContent(
  response: GeminiInteractionResponse & {
    outputs?: Array<{
      type?: string;
      text?: string;
    }>;
  },
): string {
  const outputs = response.outputs
    ?.filter((output) => output.type === "text" && output.text)
    .map((output) => output.text!.trim())
    .filter(Boolean);

  if (outputs?.length) {
    return outputs.join("\n").trim();
  }

  return (
    response.steps
      ?.flatMap((step) =>
        step.content
          ?.filter((part) => part.type === "text" && part.text)
          .map((part) => part.text!.trim()) ?? [],
      )
      .filter(Boolean)
      .join("\n")
      .trim() || ""
  );
}

async function requestGeminiReview(
  apiKey: string,
  model: string,
  fallbackModel: string,
  thinkingLevel: "minimal" | "low" | "medium" | "high",
  input: string,
  instructions: string,
): Promise<GeminiInteractionResponse> {
  try {
    return await callGeminiWithRetry(
      apiKey,
      model,
      thinkingLevel,
      input,
      instructions,
      false,
    );
  } catch (error) {
    const isServiceUnavailable =
      error instanceof Error &&
      error.message.startsWith("GEMINI_SERVICE_UNAVAILABLE:");

    const isRateLimited =
      error instanceof Error &&
      error.message.startsWith("GEMINI_RATE_LIMIT_EXHAUSTED:");

    if (
      (!isServiceUnavailable && !isRateLimited) ||
      fallbackModel === model
    ) {
      throw error;
    }

    return callGeminiWithRetry(
      apiKey,
      fallbackModel,
      "minimal",
      input,
      [
        instructions,
        "",
        isRateLimited
          ? "Le modèle principal est limité par le quota gratuit. Termine la même analyse avec ce modèle de secours."
          : "Le modèle principal est temporairement indisponible. Termine la même analyse avec ce modèle de secours.",
        "Reste strictement conforme au JSON attendu.",
      ].join("\n"),
      true,
    );
  }
}



async function reviewProjectWithGemini(
  context: ProjectAiContext,
): Promise<AiReview> {
  const { apiKey, model, fallbackModel, thinkingLevel } = getGeminiConfig();
  const instructions = buildInstructions();
  const input = JSON.stringify(context);

  const response = await requestGeminiReview(
    apiKey,
    model,
    fallbackModel,
    thinkingLevel,
    input,
    instructions,
  );

  const content = getGeminiContent(response);
  const review = tryParseAiReview(content, context);

  if (review) {
    return review;
  }

  const compactInput = buildCompactAiInput(context);
  const compactResponse = await requestGeminiReview(
    apiKey,
    model,
    fallbackModel,
    thinkingLevel,
    compactInput,
    [
      instructions,
      "",
      "Mode de secours Gemini : produis un JSON compact et strict.",
      "N'ajoute aucune explication, aucun markdown et aucune réflexion dans la réponse.",
      "Limite les observed_features à 5, les contradictions à 3 et les suggested_tasks à 2.",
      "Les champs evidence doivent rester courts et précis.",
    ].join("\n"),
  );

  const compactContent = getGeminiContent(compactResponse);
  const compactReview = tryParseAiReview(
    compactContent,
    context,
  );

  if (compactReview) {
    return compactReview;
  }

  throw new Error(
    "Gemini a répondu sans JSON exploitable via l'Interactions API. Les tentatives normale et compacte ont échoué.",
  );
}

async function reviewProjectWithOllama(
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

  const compactInput = buildCompactAiInput(context);

  const compactResponse = await requestFallbackReview(
    url,
    model,
    compactInput,
    [
      instructions,
      "",
      "Dernier mode de secours.",
      "Le contexte a été volontairement réduit pour éviter une sortie tronquée.",
      "Produis un JSON très compact et strict.",
      "Maximum 4 observed_features, 2 contradictions et 1 suggested_task.",
      "Chaque description, preuve et incertitude doit rester courte.",
      "N'ajoute aucune explication, aucun markdown et aucune réflexion.",
    ].join("\n"),
  );

  const compactContent = compactResponse.message?.content?.trim() ?? "";
  const compactReview = tryParseAiReview(
    compactContent,
    context,
  );

  if (compactReview) {
    return compactReview;
  }

  const reason =
    compactResponse.done_reason
      ? " (done_reason: " + compactResponse.done_reason + ")"
      : "";

  throw new Error(
    "Ollama a répondu sans JSON exploitable" +
      reason +
      ". Les tentatives normale et compacte ont échoué.",
  );
}



type ProjectCompanionIdea = {
  title: string;
  rationale: string;
  effort: string;
  timing: "NOW" | "NEXT" | "LATER";
};

type ProjectCompanionRecommendation = {
  title: string;
  why_now: string;
  effort: string;
  expected_result: string;
  success_criteria: string;
  files: string[];
};

type ProjectCompanionResponse = {
  answer: string;
  current_state: string;
  recommendation: ProjectCompanionRecommendation;
  ideas: ProjectCompanionIdea[];
  watchouts: string[];
  uncertainties: string[];
  references: string[];
};

const PROJECT_COMPANION_SCHEMA = {
  type: "object",
  required: [
    "answer",
    "current_state",
    "recommendation",
    "ideas",
    "watchouts",
    "uncertainties",
    "references",
  ],
  properties: {
    answer: { type: "string" },
    current_state: { type: "string" },
    recommendation: {
      type: "object",
      required: [
        "title",
        "why_now",
        "effort",
        "expected_result",
        "success_criteria",
        "files",
      ],
      properties: {
        title: { type: "string" },
        why_now: { type: "string" },
        effort: { type: "string" },
        expected_result: { type: "string" },
        success_criteria: { type: "string" },
        files: { type: "array", items: { type: "string" } },
      },
    },
    ideas: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "rationale", "effort", "timing"],
        properties: {
          title: { type: "string" },
          rationale: { type: "string" },
          effort: { type: "string" },
          timing: {
            type: "string",
            enum: ["NOW", "NEXT", "LATER"],
          },
        },
      },
    },
    watchouts: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
    references: { type: "array", items: { type: "string" } },
  },
} as const;

function buildProjectCompanionInput(
  context: ProjectAiContext,
  question: string,
): string {
  return JSON.stringify({
    USER_QUESTION: question,
    PROJECT_IDENTITY: {
      repository: context.repository,
      project: context.project_os.project,
    },
    CURRENT_PROJECT_MANAGEMENT: {
      active_tasks: context.project_os.active_tasks,
      recent_tasks_and_history: context.project_os.tasks,
      active_decisions: context.project_os.active_decisions,
      recent_decisions: context.project_os.decisions,
      recent_non_ai_activities: context.project_os.recent_activities,
    },
    PROJECT_DOCUMENTATION: context.project_documents,
    REPOSITORY_OVERVIEW: {
      tree: context.repository_tree,
      readme: context.readme,
      package_json: context.package_json,
    },
    CODE_CONTEXT: context.selected_files.map((file) => ({
      path: file.path,
      reason: file.reason,
      content: file.content,
    })),
  });
}

function buildProjectCompanionInstructions(): string {
  return [
    "Tu es le compagnon de bord permanent d'un projet de développement.",
    "Tu dois comprendre le projet comme un ensemble cohérent, pas comme une liste de fichiers.",
    "",
    "Ta mission : répondre à la question de l'utilisateur ET lui apporter la vision d'ensemble qu'un lead technique/design expérimenté aurait en regardant ce projet.",
    "",
    "SOURCES ET PRIORITÉ :",
    "1. USER_QUESTION est la question exacte à laquelle tu dois répondre.",
    "2. JOURNAL_AUDIT est la photographie technique la plus récente du projet et prime sur les descriptions historiques lorsqu'elles se contredisent avec le code.",
    "3. JOURNAL_DESIGN décrit les intentions, priorités et pistes de roadmap ; il ne prouve pas qu'une idée est implémentée.",
    "4. active_tasks et active_decisions décrivent les engagements actuels du projet.",
    "5. CODE_CONTEXT montre ce qui est réellement présent dans les fichiers fournis.",
    "6. REPOSITORY_OVERVIEW donne la vision plus large du dépôt.",
    "7. Les activités récentes sont un historique utile, pas une preuve qu'un comportement est encore présent.",
    "",
    "RÈGLE CENTRALE : distingue toujours quatre états :",
    "- IMPLEMENTÉ = observable dans le code actuel.",
    "- DÉCIDÉ = choisi dans Project OS mais pas forcément implémenté.",
    "- PLANIFIÉ / IDÉE = présent dans le journal ou une réflexion mais pas validé comme travail actuel.",
    "- INCONNU = impossible à confirmer avec le contexte fourni.",
    "",
    "Ne transforme jamais une idée du journal en fonctionnalité existante.",
    "Ne transforme jamais l'absence d'un fichier sélectionné en absence de fonctionnalité dans tout le dépôt.",
    "Ne cherche pas artificiellement un bug pour avoir quelque chose à proposer.",
    "Ne propose pas de reconstruire un système déjà présent sans symptôme ou raison concrète.",
    "",
    "QUAND L'UTILISATEUR DEMANDE 'QUOI FAIRE ENSUITE' :",
    "Commence par identifier la phase réelle du projet.",
    "Confronte le code actuel aux priorités du journal et aux décisions/tâches actives.",
    "Choisis ensuite une recommandation principale qui fait avancer le projet dans la bonne direction.",
    "La recommandation peut être technique, gameplay, UX, audio, visuelle, contenu, équilibrage, production ou préparation de release.",
    "Ne la limite pas au fichier qui semble le plus facile à modifier.",
    "",
    "QUAND TU DONNES DES IDÉES :",
    "Sépare clairement la recommandation immédiate des idées futures.",
    "Évite les systèmes génériques ou à la mode qui ne servent pas le projet.",
    "Pour chaque idée, explique pourquoi elle appartient à ce projet précisément.",
    "",
    "ESTIMATIONS :",
    "Donne une estimation de travail honnête et grossière, par exemple '1-2 h', 'une demi-journée', '1-2 jours'.",
    "L'estimation doit inclure les hypothèses importantes et ne doit pas être présentée comme une mesure précise.",
    "",
    "ANALYSE DU CODE :",
    "Suis les responsabilités entre les fichiers avant de conclure.",
    "Pour un bug, explique la chaîne causale code → comportement → conséquence.",
    "Pour une amélioration, explique capacité actuelle → limite/opportunité → bénéfice de l'évolution.",
    "Si le code et le journal se contredisent, signale la contradiction au lieu de choisir silencieusement une version.",
    "",
    "STYLE DE RÉPONSE :",
    "Réponds comme un compagnon de développement : direct, concret, critique quand nécessaire.",
    "Ne récite pas le dépôt.",
    "Ne produit pas un audit générique si la question est précise.",
    "Mais ne te prive pas d'utiliser la vision d'ensemble du projet pour améliorer la réponse.",
    "Tu peux dire explicitement 'je ne ferais pas X maintenant' avec une justification technique ou design.",
    "",
    "FORMAT :",
    "Retourne uniquement un JSON valide conforme au schéma.",
    "answer doit être la réponse naturelle à l'utilisateur, concise mais substantielle.",
    "current_state résume où en est réellement le projet.",
    "recommendation est UNE seule prochaine action principale.",
    "ideas contient 0 à 4 idées complémentaires.",
    "watchouts contient 0 à 4 risques ou pièges importants.",
    "uncertainties contient uniquement les inconnues pertinentes.",
    "references contient les chemins de fichiers, noms de documents ou sections du journal réellement utilisés.",
  ].join("\n");
}

function parseProjectCompanionResponse(content: string): ProjectCompanionResponse {
  const parsed = parseJsonObject(content);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("La réponse IA du compagnon de projet n'est pas un JSON exploitable.");
  }

  const value = parsed as Record<string, unknown>;
  const recommendation = value.recommendation;

  if (
    typeof value.answer !== "string" ||
    typeof value.current_state !== "string" ||
    !recommendation ||
    typeof recommendation !== "object" ||
    typeof (recommendation as Record<string, unknown>).title !== "string" ||
    typeof (recommendation as Record<string, unknown>).why_now !== "string" ||
    typeof (recommendation as Record<string, unknown>).effort !== "string" ||
    typeof (recommendation as Record<string, unknown>).expected_result !== "string" ||
    typeof (recommendation as Record<string, unknown>).success_criteria !== "string" ||
    !Array.isArray((recommendation as Record<string, unknown>).files) ||
    !Array.isArray(value.ideas) ||
    !Array.isArray(value.watchouts) ||
    !Array.isArray(value.uncertainties) ||
    !Array.isArray(value.references)
  ) {
    throw new Error("La réponse IA du compagnon de projet n'est pas conforme.");
  }

  const rawRecommendation = recommendation as Record<string, unknown>;

  return {
    answer: value.answer,
    current_state: value.current_state,
    recommendation: {
      title: rawRecommendation.title as string,
      why_now: rawRecommendation.why_now as string,
      effort: rawRecommendation.effort as string,
      expected_result: rawRecommendation.expected_result as string,
      success_criteria: rawRecommendation.success_criteria as string,
      files: rawRecommendation.files.filter(
        (item): item is string => typeof item === "string",
      ),
    },
    ideas: value.ideas
      .filter(
        (item): item is Record<string, unknown> =>
          !!item &&
          typeof item === "object" &&
          typeof item.title === "string" &&
          typeof item.rationale === "string" &&
          typeof item.effort === "string" &&
          (item.timing === "NOW" ||
            item.timing === "NEXT" ||
            item.timing === "LATER"),
      )
      .map((item) => ({
        title: item.title as string,
        rationale: item.rationale as string,
        effort: item.effort as string,
        timing: item.timing as "NOW" | "NEXT" | "LATER",
      }))
      .slice(0, 4),
    watchouts: value.watchouts.filter(
      (item): item is string => typeof item === "string",
    ).slice(0, 4),
    uncertainties: value.uncertainties.filter(
      (item): item is string => typeof item === "string",
    ).slice(0, 6),
    references: value.references.filter(
      (item): item is string => typeof item === "string",
    ).slice(0, 10),
  };
}

function renderProjectCompanionResponse(
  result: ProjectCompanionResponse,
): string {
  return [
    "## Compagnon de bord",
    "",
    result.answer,
    "",
    "### Où en est le projet",
    result.current_state,
    "",
    "### Ma recommandation",
    "**" + result.recommendation.title + "**",
    "",
    result.recommendation.why_now,
    "",
    "**Effort estimé :** " + result.recommendation.effort,
    "",
    "**Résultat attendu :** " + result.recommendation.expected_result,
    "",
    "**Critère de réussite :** " + result.recommendation.success_criteria,
    ...(result.recommendation.files.length > 0
      ? [
          "",
          "**Fichiers concernés :**",
          ...result.recommendation.files.map((file) => "• " + file),
        ]
      : []),
    ...(result.ideas.length > 0
      ? [
          "",
          "### Idées à garder en réserve",
          ...result.ideas.map(
            (idea) =>
              "• **" +
              idea.title +
              "** [" +
              idea.timing +
              " — " +
              idea.effort +
              "] — " +
              idea.rationale,
          ),
        ]
      : []),
    ...(result.watchouts.length > 0
      ? [
          "",
          "### Points de vigilance",
          ...result.watchouts.map((item) => "• " + item),
        ]
      : []),
    ...(result.uncertainties.length > 0
      ? [
          "",
          "### Incertitudes",
          ...result.uncertainties.map((item) => "• " + item),
        ]
      : []),
    ...(result.references.length > 0
      ? [
          "",
          "### Sources consultées",
          ...result.references.map((item) => "• " + item),
        ]
      : []),
  ].join("\n");
}

async function requestProjectCompanion(
  context: ProjectAiContext,
  question: string,
): Promise<string> {
  const input = buildProjectCompanionInput(context, question);
  const instructions = buildProjectCompanionInstructions();

  return requestProjectAskStructured(
    input,
    instructions,
    PROJECT_COMPANION_SCHEMA,
  );
}

function requestProjectAskStructured(
  input: string,
  instructions: string,
  schema: object,
): Promise<string> {
  const provider = getAiProvider();

  if (provider === "gemini") {
    const config = getGeminiConfig();

    return callGemini(
      config.apiKey,
      config.model,
      config.thinkingLevel,
      input,
      instructions,
      schema,
    )
      .then((response) => {
        const content = getGeminiContent(response);

        if (!content) {
          throw new Error("Gemini a répondu sans contenu exploitable.");
        }

        return content;
      })
      .catch(async (error) => {
        if (
          error instanceof Error &&
          !(
            error.message.startsWith("GEMINI_RATE_LIMIT:") ||
            error.message.startsWith("GEMINI_SERVICE_UNAVAILABLE:")
          )
        ) {
          throw error;
        }

        const fallback = getOllamaConfig();
        const response = await callOllama(fallback.url, {
          model: fallback.model,
          stream: false,
          think: fallback.think,
          format: schema,
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: input },
          ],
          options: {
            temperature: 0,
          },
        });

        const content = response.message?.content?.trim() ?? "";

        if (!content) {
          throw new Error(
            "Gemini est indisponible et le modèle de secours Ollama n'a renvoyé aucun contenu exploitable.",
          );
        }

        return content;
      });
  }

  const config = getOllamaConfig();

  return callOllama(config.url, {
    model: config.model,
    stream: false,
    think: config.think,
    format: schema,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input },
    ],
    options: {
      temperature: 0,
    },
  }).then((response) => {
    const content = response.message?.content?.trim() ?? "";

    if (!content) {
      throw new Error("Ollama n'a renvoyé aucun contenu exploitable.");
    }

    return content;
  });
}

export async function askProjectWithAI(
  context: ProjectAiContext,
  question: string,
): Promise<string> {
  const raw = await requestProjectCompanion(context, question);
  return renderProjectCompanionResponse(
    parseProjectCompanionResponse(raw),
  );
}

export async function reviewProjectWithAI(
  context: ProjectAiContext,
): Promise<AiReview> {
  const provider = getAiProvider();

  if (provider === "gemini") {
    try {
      return await reviewProjectWithGemini(context);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("GEMINI_RATE_LIMIT_EXHAUSTED:")
      ) {
        return reviewProjectWithOllama(context);
      }

      throw error;
    }
  }

  return reviewProjectWithOllama(context);
}
