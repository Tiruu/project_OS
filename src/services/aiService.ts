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


type ProjectAskMode = "GENERAL" | "PLANNING" | "FEATURE";

type ProjectAskPlanning = {
  title: string;
  why_now: string;
  files: string[];
  expected: string;
  success: string;
  evidence: string[];
};

type ProjectAskFeature = {
  feature: string;
  fit: string;
  capabilities: string;
  evidence: string[];
  complexity: string;
};

type ProjectAskGeneral = {
  answer: string;
};

const PROJECT_ASK_PLANNING_SCHEMA = {
  type: "object",
  required: ["title", "why_now", "files", "expected", "success", "evidence"],
  properties: {
    title: { type: "string" },
    why_now: { type: "string" },
    files: { type: "array", items: { type: "string" } },
    expected: { type: "string" },
    success: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
  },
} as const;

const PROJECT_ASK_FEATURE_SCHEMA = {
  type: "object",
  required: ["feature", "fit", "capabilities", "evidence", "complexity"],
  properties: {
    feature: { type: "string" },
    fit: { type: "string" },
    capabilities: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    complexity: { type: "string" },
  },
} as const;

const PROJECT_ASK_GENERAL_SCHEMA = {
  type: "object",
  required: ["answer"],
  properties: {
    answer: { type: "string" },
  },
} as const;

const PROJECT_ASK_MODE_SCHEMA = {
  type: "object",
  required: ["mode"],
  properties: {
    mode: {
      type: "string",
      enum: ["GENERAL", "PLANNING", "FEATURE"],
    },
  },
} as const;

const PROJECT_ASK_GROUNDING_SCHEMA = {
  type: "object",
  required: ["grounded", "issues"],
  properties: {
    grounded: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
  },
} as const;

type ProjectAskDiagnosisStatus =
  | "VERIFIED_DEFECT"
  | "ACTIVE_TASK"
  | "GROUNDED_IMPROVEMENT"
  | "INDETERMINATE";

type ProjectAskDiagnosis = {
  status: ProjectAskDiagnosisStatus;
  title: string;
  problem: string;
  why_now: string;
  files: string[];
  evidence: string[];
  counterevidence: string[];
  causal_chain: string[];
  unknowns: string[];
  confidence: number;
};

const PROJECT_ASK_DIAGNOSIS_SCHEMA = {
  type: "object",
  required: [
    "status",
    "title",
    "problem",
    "why_now",
    "files",
    "evidence",
    "counterevidence",
    "causal_chain",
    "unknowns",
    "confidence",
  ],
  properties: {
    status: {
      type: "string",
      enum: [
        "VERIFIED_DEFECT",
        "ACTIVE_TASK",
        "GROUNDED_IMPROVEMENT",
        "INDETERMINATE",
      ],
    },
    title: { type: "string" },
    problem: { type: "string" },
    why_now: { type: "string" },
    files: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    counterevidence: { type: "array", items: { type: "string" } },
    causal_chain: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
} as const;

const PROJECT_ASK_DIAGNOSIS_REVIEW_SCHEMA = {
  type: "object",
  required: ["approved", "issues"],
  properties: {
    approved: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
  },
} as const;

function buildProjectAskModeInput(
  context: ProjectAiContext,
  question: string,
): string {
  return JSON.stringify({
    question,
    project: {
      name: context.project_os.project.name,
      type: context.project_os.project.type,
      purpose: context.project_os.project.purpose,
      current_state: context.project_os.project.current_state,
    },
    active_tasks: context.project_os.active_tasks,
    active_decisions: context.project_os.active_decisions,
  });
}

function buildProjectAskModeInstructions(): string {
  return [
    "Tu es le routeur d'intention de Project OS.",
    "Ta seule mission est de déterminer dans quel mode /project-ask doit traiter la question.",
    "",
    "Modes autorisés :",
    "GENERAL = question générale, explication, diagnostic, compréhension ou demande qui ne demande pas explicitement de choisir la prochaine étape ni d'imaginer une nouvelle fonctionnalité.",
    "PLANNING = l'utilisateur demande quoi faire ensuite, la prochaine étape, la prochaine modification, la suite du développement, ou quelle tâche de développement prioriser.",
    "FEATURE = l'utilisateur demande d'imaginer, proposer ou choisir une nouvelle fonctionnalité à ajouter au jeu.",
    "",
    "Comprends le sens de la question, pas des mots-clés exacts.",
    "Les accents, fautes de frappe, synonymes, formulations naturelles et ordre des mots ne doivent jamais changer l'intention lorsqu'elle reste compréhensible.",
    "Par exemple, 'quelle est la suite du développement ?', 'on fait quoi ensuite ?', 'tu me conseilles quoi pour continuer le jeu ?' et 'quelle prochaine modif ?' sont PLANNING.",
    "Une question qui parle du développement sans demander la prochaine étape n'est pas automatiquement PLANNING.",
    "Une question qui demande une idée de nouvelle mécanique ou fonctionnalité est FEATURE.",
    "En cas d'ambiguïté réelle, choisis GENERAL.",
    "",
    "Ne réponds pas à la question. Retourne uniquement un objet JSON conforme au schéma fourni.",
  ].join("\\n");
}

async function classifyProjectAskMode(
  context: ProjectAiContext,
  question: string,
): Promise<ProjectAskMode> {
  const raw = await requestProjectAskStructured(
    buildProjectAskModeInput(context, question),
    buildProjectAskModeInstructions(),
    PROJECT_ASK_MODE_SCHEMA,
  );

  const parsed = parseJsonObject(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Le classifieur IA de /project-ask n'a pas renvoyé de JSON exploitable.");
  }

  const mode = (parsed as Record<string, unknown>).mode;

  if (mode === "GENERAL" || mode === "PLANNING" || mode === "FEATURE") {
    return mode;
  }

  throw new Error("Le classifieur IA de /project-ask a renvoyé un mode invalide.");
}

function buildProjectAskInput(
  context: ProjectAiContext,
  question: string,
  mode: ProjectAskMode,
): string {
  const payload: Record<string, unknown> = {
    question,
    mode,
    project: context.project_os.project,
    active_tasks: context.project_os.active_tasks,
    active_decisions: context.project_os.active_decisions,
    recent_activities: context.project_os.recent_activities.slice(0, 12),
    repository: {
      name: context.repository.name,
      full_name: context.repository.full_name,
      default_branch: context.repository.default_branch,
    },
    selected_files: context.selected_files.map((file) => ({
      path: file.path,
      reason: file.reason,
      truncated: file.truncated,
      total_chars: file.total_chars,
      content: file.content,
    })),
  };

  if (mode === "GENERAL") {
    payload.repository_tree = context.repository_tree.slice(0, 120);
    payload.readme = context.readme;
    payload.package_json = context.package_json;
  }

  return JSON.stringify(payload);
}

function buildProjectAskDiagnosisInput(
  context: ProjectAiContext,
  question: string,
): string {
  return JSON.stringify({
    question,
    project: context.project_os.project,
    active_tasks: context.project_os.active_tasks,
    active_decisions: context.project_os.active_decisions,
    recent_activities: context.project_os.recent_activities.slice(0, 12),
    selected_files: context.selected_files.map((file) => ({
      path: file.path,
      reason: file.reason,
      truncated: file.truncated,
      total_chars: file.total_chars,
      content: file.content,
    })),
    repository_tree: context.repository_tree.slice(0, 180),
  });
}

function buildProjectAskDiagnosisInstructions(): string {
  return [
    "Tu es le diagnosticien senior de Project OS.",
    "Avant de proposer une prochaine modification, tu dois déterminer ce que le contexte permet réellement d'affirmer.",
    "",
    "STATUTS AUTORISÉS :",
    "VERIFIED_DEFECT = défaut actuel démontré par le code fourni ou contradiction technique explicite avec une décision/tâche active.",
    "ACTIVE_TASK = tâche active pertinente dont le code n'a pas démontré qu'elle est déjà résolue.",
    "GROUNDED_IMPROVEMENT = amélioration de développement justifiée par le comportement actuel du code, sans prétendre qu'un bug existe.",
    "INDETERMINATE = le contexte ne permet pas de trancher sans spéculation.",
    "",
    "HIÉRARCHIE DES PREUVES :",
    "1. Code actuel fourni.",
    "2. active_tasks et active_decisions.",
    "3. repository_tree uniquement pour savoir qu'un fichier existe.",
    "4. recent_activities uniquement comme historique et piste d'inspection, jamais comme preuve d'un bug actuel.",
    "",
    "MÉTHODE DE DIAGNOSTIC :",
    "1. Formule une hypothèse précise sur le problème ou le prochain besoin.",
    "2. Rassemble les preuves qui la soutiennent.",
    "3. Rassemble activement les éléments qui la réfutent ou la rendent moins certaine.",
    "4. Suis la chaîne causale complète : appel → état → condition → await → retour → signal → destruction/effet, selon le cas.",
    "5. Distingue fait observé, inférence, hypothèse et préférence de conception.",
    "6. Si une étape causale manque dans les fichiers fournis, note-la dans unknowns et choisis INDETERMINATE plutôt que d'inventer.",
    "",
    "RÈGLES IMPORTANTES :",
    "Un motif de code suspect n'est pas un bug.",
    "queue_free(), await, signal, coroutine, timeout, reparent ou autre primitive technique ne sont pas des preuves de défaut à eux seuls.",
    "Une optimisation préventive n'est pas un VERIFIED_DEFECT.",
    "Une fonctionnalité absente n'est pas automatiquement un problème.",
    "Une tâche historique terminée n'est pas une tâche actuelle.",
    "Une active_task pertinente reste une piste de planification, mais tu ne dois pas prétendre qu'elle est techniquement nécessaire si le code démontre déjà l'objectif.",
    "Si le diagnostic est INDETERMINATE, ne force pas un défaut pour satisfaire la demande de 'suite du développement'.",
    "Une confiance élevée exige une chaîne causale complète et au moins une preuve qui ne dépend pas d'une simple absence dans un extrait.",
    "",
    "selected_files peut être tronqué. Si truncated=true, il est interdit d'utiliser ce fichier pour prouver qu'une fonction, une branche ou un comportement est absent.",
    "",
    "Retourne uniquement un JSON conforme au schéma fourni.",
  ].join("\n");
}

function parseProjectAskDiagnosis(
  content: string,
): ProjectAskDiagnosis {
  const parsed = parseJsonObject(content);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Le diagnostic IA de /project-ask n'est pas un JSON exploitable.");
  }

  const value = parsed as Record<string, unknown>;

  if (
    (
      value.status !== "VERIFIED_DEFECT" &&
      value.status !== "ACTIVE_TASK" &&
      value.status !== "GROUNDED_IMPROVEMENT" &&
      value.status !== "INDETERMINATE"
    ) ||
    typeof value.title !== "string" ||
    typeof value.problem !== "string" ||
    typeof value.why_now !== "string" ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.evidence) ||
    !Array.isArray(value.counterevidence) ||
    !Array.isArray(value.causal_chain) ||
    !Array.isArray(value.unknowns) ||
    typeof value.confidence !== "number"
  ) {
    throw new Error("Le diagnostic IA de /project-ask n'est pas conforme.");
  }

  const files = value.files.filter(
    (item): item is string => typeof item === "string",
  );
  const evidence = value.evidence.filter(
    (item): item is string => typeof item === "string",
  );
  const counterevidence = value.counterevidence.filter(
    (item): item is string => typeof item === "string",
  );
  const causalChain = value.causal_chain.filter(
    (item): item is string => typeof item === "string",
  );
  const unknowns = value.unknowns.filter(
    (item): item is string => typeof item === "string",
  );
  const confidence = Math.max(0, Math.min(1, value.confidence));

  let status = value.status;

  if (
    status === "VERIFIED_DEFECT" &&
    (
      confidence < 0.8 ||
      evidence.length < 2 ||
      causalChain.length < 2 ||
      unknowns.length > 0
    )
  ) {
    status = "INDETERMINATE";
    unknowns.push(
      "Le diagnostic ne satisfait pas les critères minimaux pour être classé comme défaut vérifié.",
    );
  }

  if (
    status === "ACTIVE_TASK" &&
    !evidence.some((item) => /^TASK:[a-f0-9-]+/i.test(item.trim()))
  ) {
    status = "INDETERMINATE";
    unknowns.push(
      "La tâche active n'est pas rattachée explicitement à un identifiant TASK.",
    );
  }

  if (status === "GROUNDED_IMPROVEMENT" && evidence.length === 0) {
    status = "INDETERMINATE";
    unknowns.push(
      "L'amélioration proposée ne possède aucune preuve explicite.",
    );
  }

  return {
    status,
    title: value.title,
    problem: value.problem,
    why_now: value.why_now,
    files,
    evidence,
    counterevidence,
    causal_chain: causalChain,
    unknowns,
    confidence,
  };

function buildProjectAskDiagnosisReviewInput(
  context: ProjectAiContext,
  question: string,
  diagnosis: ProjectAskDiagnosis,
): string {
  return JSON.stringify({
    question,
    diagnosis,
    active_tasks: context.project_os.active_tasks,
    active_decisions: context.project_os.active_decisions,
    selected_files: context.selected_files.map((file) => ({
      path: file.path,
      truncated: file.truncated,
      total_chars: file.total_chars,
      content: file.content,
    })),
  });
}

function buildProjectAskDiagnosisReviewInstructions(): string {
  return [
    "Tu es le reviewer adversarial senior de Project OS.",
    "Tu ne dois pas trouver une meilleure idée. Tu dois essayer de faire tomber le diagnostic.",
    "",
    "Pour chaque affirmation centrale du diagnostic, pose implicitement :",
    "1. Quelle ligne ou chaîne d'appels démontre exactement cette affirmation ?",
    "2. Quelle ligne ou branche pourrait la réfuter ?",
    "3. Est-ce un bug actuel, une amélioration préventive, une tâche active ou simplement une hypothèse ?",
    "4. Le diagnostic dépend-il d'un fichier tronqué ?",
    "5. Une conclusion causale a-t-elle été remplacée par une simple coïncidence de deux lignes de code ?",
    "",
    "REJETTE le diagnostic si :",
    "- il qualifie de bug un comportement seulement potentiellement problématique ;",
    "- il déduit une absence depuis un fichier tronqué ou non fourni ;",
    "- il utilise une recent_activity comme preuve d'un problème actuel ;",
    "- il saute une étape importante de la chaîne causale ;",
    "- il transforme une préférence de design en défaut technique ;",
    "- il ignore une contre-preuve significative présente dans le contexte.",
    "",
    "APPROUVE seulement si le statut est défendable après cette attaque.",
    "Pour VERIFIED_DEFECT, exige une causalité technique suffisamment explicite.",
    "Pour INDETERMINATE, considère le diagnostic acceptable même si la réponse ne produit aucun bug : l'incertitude est un résultat valide.",
    "Retourne uniquement le JSON du schéma fourni.",
  ].join("\n");
}

async function reviewProjectAskDiagnosis(
  context: ProjectAiContext,
  question: string,
  diagnosis: ProjectAskDiagnosis,
): Promise<{ approved: boolean; issues: string[] }> {
  const raw = await requestProjectAskStructured(
    buildProjectAskDiagnosisReviewInput(context, question, diagnosis),
    buildProjectAskDiagnosisReviewInstructions(),
    PROJECT_ASK_DIAGNOSIS_REVIEW_SCHEMA,
  );

  const parsed = parseJsonObject(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Le reviewer du diagnostic de /project-ask n'a pas renvoyé de JSON exploitable.");
  }

  const value = parsed as Record<string, unknown>;

  if (typeof value.approved !== "boolean" || !Array.isArray(value.issues)) {
    throw new Error("Le reviewer du diagnostic de /project-ask est invalide.");
  }

  return {
    approved: value.approved,
    issues: value.issues.filter(
      (item): item is string => typeof item === "string",
    ),
  };
}

function buildProjectAskInstructions(
  mode: ProjectAskMode,
  diagnosis: ProjectAskDiagnosis | null = null,
): string {
  const common = [
    "Tu es l'assistant de décision de Project OS.",
    "Ta mission est de répondre à UNE question précise sur un projet.",
    "Tu ne dois pas transformer la question en audit général du projet.",
    "",
    "SOURCE DE VÉRITÉ :",
    "1. Le contenu actuel des fichiers fournis est la preuve principale du comportement du code.",
    "2. Les données Project OS décrivent l'état enregistré : seules active_tasks et active_decisions sont des éléments actuels.",
    "3. Toutes les recent_activities sont historiques. Elles peuvent orienter ce qu'il faut vérifier, mais ne servent jamais de preuve qu'un comportement existe encore, a disparu ou constitue actuellement un bug.",
    "4. Les documents peuvent être obsolètes. Ils servent à comprendre le contexte, pas à contredire le code actuel sans preuve.",
    "5. selected_files peut contenir des extraits tronqués. Chaque fichier fournit les champs truncated et total_chars : si truncated=true, son extrait ne permet jamais de conclure qu'une fonction, un appel ou un comportement est absent.",
    "6. Pour affirmer un comportement impliquant plusieurs fonctions, suis réellement la chaîne d'appels dans les fichiers fournis. Si une partie de cette chaîne n'est pas visible, indique que le comportement n'est pas déterminable à partir du contexte fourni.",
    "7. Une suspicion ne doit jamais être formulée comme un bug confirmé. Sans preuve directe dans le code actuel fourni, préfère une proposition de vérification ou indique que la suite ne peut pas être déterminée avec certitude.",
    "8. Si une responsabilité a été déplacée entre fichiers, suis les appels jusqu'au fichier qui implémente réellement le comportement.",
    "9. N'invente jamais une fonction, un fichier, une décision ou un besoin.",
    "10. Quand une information n'est pas déterminable, dis-le plutôt que de l'imaginer.",
    "",
    "CE QUE TU DOIS ÉVITER :",
    "Ne commence pas par 'voici une analyse du jeu', 'core mechanics', 'game overview', 'technical strengths' ou un résumé de l'architecture.",
    "Ne réponds pas à une question différente de celle contenue dans le champ question.",
    "Ne transforme pas une absence de fonctionnalité en problème simplement parce qu'elle est absente.",
    "Ne propose pas plusieurs options de roadmap quand une seule réponse est demandée.",
    ...(diagnosis
      ? [
          "",
          "DIAGNOSTIC VALIDÉ PAR LE PIPELINE :",
          JSON.stringify(diagnosis),
          "Tu dois respecter ce diagnostic. Ne réintroduis pas dans la réponse finale une hypothèse que le diagnostic a rejetée ou classée INDETERMINATE.",
        ]
      : []),
  ];

  if (mode === "PLANNING") {
    return [
      ...common,
      "",
      "MODE : PROCHAINE ÉTAPE DE DÉVELOPPEMENT",
      "La question demande ce qu'il faut modifier ensuite dans le jeu.",
      "Tu dois choisir UNE seule modification.",
      "Ordre de décision : active_tasks pertinentes, puis active_decisions pertinentes, puis vérification du code actuel. Les recent_activities servent uniquement d'historique et de piste d'inspection, jamais de preuve d'un état actuel.",
      "Une tâche active pertinente doit être privilégiée plutôt qu'une nouvelle idée.",
      "S'il n'existe pas de tâche active pertinente, choisis une amélioration ou extension réellement justifiée par le code actuel.",
      "La proposition doit être concrète, localisable dans le code et testable.",
      "Ne propose pas une amélioration générique comme 'améliorer le game feel' sans comportement précis.",
      "Ne prétends pas qu'un comportement est absent sans preuve directe dans le code fourni.",
      "Si le code nécessaire pour trancher une hypothèse est tronqué ou non fourni, ne transforme pas l'hypothèse en BUG. Propose au maximum une vérification ciblée, ou indique que la suite n'est pas déterminable avec le contexte actuel.",
      "Pour une tâche BUG, why_now et evidence doivent être fondés sur le code actuel ou une active_task/active_decision actuelle. Une recent_activity historique ne peut jamais être la preuve principale d'un bug actuel.",
      "Dans evidence, n'utilise jamais ACTIVITY:<id> pour justifier la prochaine modification. Les preuves valides sont le contenu actuel des fichiers fournis ou TASK:<id>/DECISION:<id> pour des éléments encore actifs.",
      "Une evidence qui ne peut pas être rattachée à un fichier fourni, une tâche active ou une décision active ne doit pas être utilisée.",
      "Si le diagnostic est VERIFIED_DEFECT, la proposition doit traiter le défaut démontré ; ne le transforme pas en simple nettoyage préventif.",
      "Si le diagnostic est ACTIVE_TASK, la proposition doit rester alignée sur cette tâche et ne pas inventer un nouveau bug voisin.",
      "Si le diagnostic est GROUNDED_IMPROVEMENT, présente-le comme une amélioration, jamais comme une correction d'un bug non démontré.",
      "Si le diagnostic est INDETERMINATE, la réponse doit rester explicitement conservatrice.",
      "La réponse doit permettre de créer immédiatement UNE tâche de développement.",
      "",
      "RENVOIE UNIQUEMENT UN OBJET JSON conforme au schéma fourni.",
      "title = nom court de la modification.",
      "why_now = raison factuelle liée à l'état actuel.",
      "files = fichiers réellement concernés ou à vérifier ; n'en invente aucun.",
      "expected = résultat observable après la modification.",
      "success = critère de réussite vérifiable.",
      "evidence = 1 à 4 preuves courtes issues du code actuel ou de Project OS.",
    ].join("\n");
  }

  if (mode === "FEATURE") {
    return [
      ...common,
      "",
      "MODE : IDÉATION DE FONCTIONNALITÉ",
      "La question demande UNE fonctionnalité à ajouter au jeu.",
      "Choisis une fonctionnalité nouvelle qui s'intègre aux capacités actuellement observables.",
      "Ne propose pas une fonctionnalité déjà présente sous un autre nom.",
      "Ne déduis pas un besoin utilisateur non observé ; explique plutôt la valeur potentielle dans le workflow actuel.",
      "Vérifie le code fourni avant d'affirmer qu'une capacité n'existe pas.",
      "",
      "RENVOIE UNIQUEMENT UN OBJET JSON conforme au schéma fourni.",
      "feature = nom de la fonctionnalité.",
      "fit = pourquoi elle s'intègre au jeu existant.",
      "capabilities = ce qu'elle permettrait concrètement.",
      "evidence = 1 à 4 preuves courtes.",
      "complexity = faible, moyenne ou élevée, avec une justification très courte.",
    ].join("\n");
  }

  return [
    ...common,
    "",
    "MODE : RÉPONSE DIRECTE",
    "Réponds directement à la question. N'ajoute un état des lieux du projet que si la question le demande.",
    "",
    "RENVOIE UNIQUEMENT UN OBJET JSON conforme au schéma fourni.",
    "answer = réponse complète, concise et factuelle à la question.",
  ].join("\n");
}

function getProjectAskSchema(mode: ProjectAskMode) {
  if (mode === "PLANNING") return PROJECT_ASK_PLANNING_SCHEMA;
  if (mode === "FEATURE") return PROJECT_ASK_FEATURE_SCHEMA;
  return PROJECT_ASK_GENERAL_SCHEMA;
}

function buildProjectAskGroundingInput(
  context: ProjectAiContext,
  question: string,
  draft: ProjectAskPlanning,
): string {
  return JSON.stringify({
    question,
    draft,
    active_tasks: context.project_os.active_tasks,
    active_decisions: context.project_os.active_decisions,
    recent_activities: context.project_os.recent_activities,
    selected_files: context.selected_files.map((file) => ({
      path: file.path,
      reason: file.reason,
      truncated: file.truncated,
      total_chars: file.total_chars,
      content: file.content,
    })),
    repository_tree: context.repository_tree,
  });
}

function buildProjectAskGroundingInstructions(): string {
  return [
    "Tu es le vérificateur de grounding et le reviewer adversarial de Project OS.",
    "Ta seule mission est de déterminer si une proposition PLANNING est non seulement sourcée, mais réellement démontrable par le code fourni.",
    "",
    "RÈGLE ABSOLUE : une preuve textuelle ne suffit pas. Vérifie la logique qui relie chaque preuve à la conclusion.",
    "Un chemin dans repository_tree prouve seulement qu'un fichier existe, pas ce qu'il fait.",
    "Si selected_files.truncated=true, l'extrait ne permet jamais de conclure qu'une fonction, un appel ou un comportement est absent de ce fichier.",
    "Les recent_activities sont historiques et ne peuvent jamais prouver qu'un bug existe encore aujourd'hui.",
    "Les active_tasks et active_decisions décrivent des éléments encore ouverts/actifs, mais ne prouvent pas qu'une tâche est techniquement nécessaire si le code la contredit.",
    "",
    "REVIEW ADVERSARIAL :",
    "Pour chaque affirmation centrale du brouillon, cherche activement une lecture du code qui la rend fausse, incomplète ou non nécessaire.",
    "Ne confonds jamais 'ce code pourrait poser problème' avec 'le code démontre un problème actuel'. Une tâche BUG exige la seconde.",
    "Une ligne queue_free() prouve seulement qu'une suppression est demandée ; elle ne prouve pas qu'un noeud est immédiatement détruit ni qu'une coroutine effectue des itérations supplémentaires après sa destruction.",
    "Pour les affirmations sur async, coroutine, await, queue_free, signaux, ordre d'exécution, destruction ou lifecycle, suis toutes les branches et tous les appels pertinents visibles avant de conclure.",
    "Vérifie explicitement les return, await, guards d'état et conditions de boucle après l'opération supposée problématique.",
    "Si une fonction A appelle une fonction async B, distingue soigneusement 'B est appelée', 'B est attendue', 'B reprend plus tard' et 'A continue après B'.",
    "Une optimisation préventive n'est pas un bug confirmé. Si le changement pourrait être utile sans que le défaut soit démontré, grounded=false pour une proposition qui le présente comme nécessaire maintenant.",
    "Une preuve de lignes de code qui contiennent simplement le motif cité ne suffit pas pour valider une affirmation causale.",
    "Sans preuve de comportement incorrect, reformule implicitement le problème en incertitude/vérification au lieu de valider une tâche BUG.",
    "",
    "Si le brouillon affirme qu'un comportement n'existe pas ou continue inutilement, vérifie que le contexte contient réellement la chaîne d'appels et le contrôle de flux nécessaires pour démontrer cette absence ou cette continuation.",
    "En cas de doute, d'information manquante ou de causalité non démontrée, grounded=false.",
    "Si une seule affirmation centrale du brouillon n'est pas démontrable, grounded=false.",
    "",
    "issues doit lister brièvement chaque affirmation insuffisamment démontrée et expliquer quelle étape de la causalité manque ou contredit le brouillon.",
    "Retourne uniquement le JSON du schéma fourni.",
  ].join("\n");
}

async function verifyProjectAskPlanning(
  context: ProjectAiContext,
  question: string,
  draft: ProjectAskPlanning,
): Promise<{ grounded: boolean; issues: string[] }> {
  const raw = await requestProjectAskStructured(
    buildProjectAskGroundingInput(context, question, draft),
    buildProjectAskGroundingInstructions(),
    PROJECT_ASK_GROUNDING_SCHEMA,
  );

  const parsed = parseJsonObject(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Le vérificateur de grounding de /project-ask n'a pas renvoyé de JSON exploitable.");
  }

  const value = parsed as Record<string, unknown>;

  if (
    typeof value.grounded !== "boolean" ||
    !Array.isArray(value.issues)
  ) {
    throw new Error("La vérification de grounding de /project-ask est invalide.");
  }

  return {
    grounded: value.grounded,
    issues: value.issues.filter(
      (item): item is string => typeof item === "string",
    ),
  };
}

function parseProjectAskResult(
  content: string,
  mode: ProjectAskMode,
): ProjectAskPlanning | ProjectAskFeature | ProjectAskGeneral {
  const parsed = parseJsonObject(content);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("La réponse IA de /project-ask n'est pas un JSON exploitable.");
  }

  const value = parsed as Record<string, unknown>;

  if (mode === "PLANNING") {
    if (
      typeof value.title !== "string" ||
      typeof value.why_now !== "string" ||
      !Array.isArray(value.files) ||
      typeof value.expected !== "string" ||
      typeof value.success !== "string" ||
      !Array.isArray(value.evidence)
    ) {
      throw new Error("La réponse IA planning n'est pas conforme.");
    }

    return {
      title: value.title,
      why_now: value.why_now,
      files: value.files.filter((item): item is string => typeof item === "string"),
      expected: value.expected,
      success: value.success,
      evidence: value.evidence.filter(
        (item): item is string => typeof item === "string",
      ),
    };
  }

  if (mode === "FEATURE") {
    if (
      typeof value.feature !== "string" ||
      typeof value.fit !== "string" ||
      typeof value.capabilities !== "string" ||
      !Array.isArray(value.evidence) ||
      typeof value.complexity !== "string"
    ) {
      throw new Error("La réponse IA feature n'est pas conforme.");
    }

    return {
      feature: value.feature,
      fit: value.fit,
      capabilities: value.capabilities,
      evidence: value.evidence.filter(
        (item): item is string => typeof item === "string",
      ),
      complexity: value.complexity,
    };
  }

  if (typeof value.answer !== "string") {
    throw new Error("La réponse IA générale n'est pas conforme.");
  }

  return { answer: value.answer };
}

function renderProjectAskResult(
  result: ProjectAskPlanning | ProjectAskFeature | ProjectAskGeneral,
  mode: ProjectAskMode,
): string {
  if (mode === "PLANNING") {
    const planning = result as ProjectAskPlanning;

    return [
      "### " + planning.title,
      "",
      "**Pourquoi maintenant**",
      planning.why_now,
      "",
      "**Fichiers concernés**",
      planning.files.length > 0
        ? planning.files.map((file) => "• " + file).join("\n")
        : "À déterminer à partir du code local.",
      "",
      "**Résultat attendu**",
      planning.expected,
      "",
      "**Critère de réussite**",
      planning.success,
      "",
      ...(planning.evidence.length > 0
        ? ["**Base factuelle**", planning.evidence.map((item) => "• " + item).join("\n")]
        : []),
    ].join("\n");
  }

  if (mode === "FEATURE") {
    const feature = result as ProjectAskFeature;

    return [
      "### " + feature.feature,
      "",
      "**Pourquoi elle s'intègre au jeu**",
      feature.fit,
      "",
      "**Ce qu'elle permettrait de faire**",
      feature.capabilities,
      "",
      "**Preuves dans le code actuel**",
      feature.evidence.length > 0
        ? feature.evidence.map((item) => "• " + item).join("\n")
        : "Aucune preuve directe suffisante dans le contexte fourni.",
      "",
      "**Complexité estimée**",
      feature.complexity,
    ].join("\n");
  }

  return (result as ProjectAskGeneral).answer;
}

async function requestProjectAskStructured(
  input: string,
  instructions: string,
  schema: object,
): Promise<string> {
  const provider = getAiProvider();

  if (provider === "gemini") {
    const config = getGeminiConfig();

    try {
      const response = await callGemini(
        config.apiKey,
        config.model,
        config.thinkingLevel,
        input,
        instructions,
        schema,
      );

      const content = getGeminiContent(response);
      if (content) {
        return content;
      }

      throw new Error("Gemini a répondu sans contenu exploitable.");
    } catch (error) {
      if (
        error instanceof Error &&
        (
          error.message.startsWith("GEMINI_RATE_LIMIT:") ||
          error.message.startsWith("GEMINI_SERVICE_UNAVAILABLE:") ||
          error.message.includes("sans contenu exploitable")
        )
      ) {
        const fallback = getOllamaConfig();
        const response = await callOllama(fallback.url, {
          model: fallback.model,
          stream: false,
          think: false,
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
        if (content) {
          return content;
        }

        throw new Error(
          "Gemini est indisponible et le modèle de secours Ollama n'a renvoyé aucun contenu exploitable.",
        );
      }

      throw error;
    }
  }

  const config = getOllamaConfig();
  const response = await callOllama(config.url, {
    model: config.model,
    stream: false,
    think: false,
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
    throw new Error("Ollama n'a renvoyé aucun contenu exploitable.");
  }

  return content;
}

export async function askProjectWithAI(
  context: ProjectAiContext,
  question: string,
): Promise<string> {
  const mode = await classifyProjectAskMode(context, question);

  if (mode !== "PLANNING") {
    const input = buildProjectAskInput(context, question, mode);
    const instructions = buildProjectAskInstructions(mode);
    const schema = getProjectAskSchema(mode);
    const raw = await requestProjectAskStructured(
      input,
      instructions,
      schema,
    );
    const result = parseProjectAskResult(raw, mode);
    return renderProjectAskResult(result, mode);
  }

  let diagnosisRaw = await requestProjectAskStructured(
    buildProjectAskDiagnosisInput(context, question),
    buildProjectAskDiagnosisInstructions(),
    PROJECT_ASK_DIAGNOSIS_SCHEMA,
  );
  let diagnosis = parseProjectAskDiagnosis(diagnosisRaw);

  let diagnosisReview = await reviewProjectAskDiagnosis(
    context,
    question,
    diagnosis,
  );

  if (!diagnosisReview.approved) {
    diagnosisRaw = await requestProjectAskStructured(
      JSON.stringify({
        ...JSON.parse(buildProjectAskDiagnosisInput(context, question)),
        rejected_diagnosis: diagnosis,
        reviewer_issues: diagnosisReview.issues,
      }),
      [
        buildProjectAskDiagnosisInstructions(),
        "",
        "LE PREMIER DIAGNOSTIC A ÉTÉ REJETÉ PAR UN REVIEWER ADVERSARIAL.",
        ...diagnosisReview.issues.map((issue) => "- " + issue),
        "",
        "Reconstruis le diagnostic depuis les preuves, sans défendre artificiellement le brouillon précédent.",
        "Tu peux choisir INDETERMINATE. Il vaut mieux une réponse indéterminée qu'un bug inventé.",
      ].join("\n"),
      PROJECT_ASK_DIAGNOSIS_SCHEMA,
    );

    diagnosis = parseProjectAskDiagnosis(diagnosisRaw);
    diagnosisReview = await reviewProjectAskDiagnosis(
      context,
      question,
      diagnosis,
    );
  }

  if (!diagnosisReview.approved) {
    const files = context.selected_files
      .filter((file) => !file.truncated)
      .slice(0, 4)
      .map((file) => file.path);

    return renderProjectAskResult(
      {
        title: "Diagnostic insuffisant pour choisir une modification",
        why_now:
          "Le contexte actuel ne permet pas de valider un diagnostic technique suffisamment solide pour recommander une modification précise.",
        files,
        expected:
          "Inspecter le comportement ou les fichiers manquants avant de créer une nouvelle tâche.",
        success:
          "Une chaîne causale complète et vérifiable relie le comportement observé à la modification proposée.",
        evidence: diagnosisReview.issues.map(
          (issue) => "DIAGNOSTIC REVIEW: " + issue,
        ),
      },
      "PLANNING",
    );
  }

  const input = buildProjectAskInput(context, question, "PLANNING");
  const instructions = buildProjectAskInstructions("PLANNING", diagnosis);
  const schema = PROJECT_ASK_PLANNING_SCHEMA;
  let raw = await requestProjectAskStructured(
    JSON.stringify({
      ...JSON.parse(input),
      diagnosis,
    }),
    instructions,
    schema,
  );
  let result = parseProjectAskResult(raw, "PLANNING");

  let grounding = await verifyProjectAskPlanning(
    context,
    question,
    result,
  );

  if (!grounding.grounded) {
    const repairInstructions = [
      instructions,
      "",
      "CONTRÔLE DE GROUNDING ÉCHOUÉ.",
      "Le brouillon précédent contenait des affirmations insuffisamment démontrées.",
      "Problèmes détectés :",
      ...grounding.issues.map((issue) => "- " + issue),
      "",
      "Réécris uniquement à partir du diagnostic validé et des preuves fournies.",
      "Ne transforme jamais une hypothèse rejetée en bug.",
      "Si le diagnostic est INDETERMINATE, la réponse finale doit rester conservatrice.",
    ].join("\n");

    raw = await requestProjectAskStructured(
      JSON.stringify({
        ...JSON.parse(input),
        diagnosis,
      }),
      repairInstructions,
      schema,
    );
    result = parseProjectAskResult(raw, "PLANNING");

    grounding = await verifyProjectAskPlanning(
      context,
      question,
      result,
    );
  }

  if (!grounding.grounded) {
    const conservativeFiles = context.selected_files
      .filter((file) => !file.truncated)
      .slice(0, 4)
      .map((file) => file.path);

    return renderProjectAskResult(
      {
        title:
          diagnosis.status === "INDETERMINATE"
            ? "Vérifier avant de modifier"
            : "Proposition insuffisamment démontrée",
        why_now:
          diagnosis.unknowns.length > 0
            ? diagnosis.unknowns.join(" ")
            : "La proposition finale n'a pas pu être démontrée avec suffisamment de certitude à partir du contexte actuel.",
        files:
          diagnosis.files.length > 0
            ? diagnosis.files
            : conservativeFiles,
        expected:
          "Confirmer le comportement et sa chaîne causale dans le code complet avant de modifier le projet.",
        success:
          "La modification proposée est directement reliée à un comportement démontré ou à une tâche active vérifiée.",
        evidence:
          diagnosis.counterevidence.length > 0
            ? diagnosis.counterevidence.map(
                (item) => "CONTRE-PREUVE: " + item,
              )
            : grounding.issues.map(
                (issue) => "GROUNDING: " + issue,
              ),
      },
      "PLANNING",
    );
  }

  return renderProjectAskResult(result, "PLANNING");
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
