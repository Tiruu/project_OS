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



type CompanionEvidence = {
  source: string;
  excerpt: string;
};

type ProjectCompanionRecommendation = {
  priority_id: string;
  title: string;
  why: string;
  detail: string;
  effort: string;
  timing: "NOW" | "NEXT" | "LATER";
  evidence: CompanionEvidence[];
};

type ProjectCompanionProblem = {
  title: string;
  description: string;
  impact: string;
  evidence: CompanionEvidence[];
};

type ProjectCompanionResponse = {
  answer: string;
  project_state: string;
  recommendations: ProjectCompanionRecommendation[];
  problems: ProjectCompanionProblem[];
  unknowns: string[];
  references: string[];
};

const PROJECT_COMPANION_SCHEMA = {
  type: "object",
  required: [
    "answer",
    "project_state",
    "recommendations",
    "problems",
    "unknowns",
    "references",
  ],
  properties: {
    answer: { type: "string" },
    project_state: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        required: [
          "title",
          "why",
          "detail",
          "effort",
          "timing",
          "evidence",
        ],
        properties: {
          priority_id: { type: "string" },
          title: { type: "string" },
          why: { type: "string" },
          detail: { type: "string" },
          effort: { type: "string" },
          timing: {
            type: "string",
            enum: ["NOW", "NEXT", "LATER"],
          },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["source", "excerpt"],
              properties: {
                source: { type: "string" },
                excerpt: { type: "string" },
              },
            },
          },
        },
      },
    },
    problems: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "description", "impact", "evidence"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          impact: { type: "string" },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["source", "excerpt"],
              properties: {
                source: { type: "string" },
                excerpt: { type: "string" },
              },
            },
          },
        },
      },
    },
    unknowns: { type: "array", items: { type: "string" } },
    references: { type: "array", items: { type: "string" } },
  },
} as const;

const MAX_COMPANION_INPUT_CHARS = 60_000;
const MAX_REPOSITORIES_IN_CONTEXT = 6;
const MAX_RETRIEVAL_DOCUMENTS = 4;
const MAX_RETRIEVAL_FILES = 5;
const MAX_MEMORY_ITEMS = 8;

function compactCompanionText(
  value: string | null | undefined,
  maxChars: number,
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const headChars = Math.floor(maxChars * 0.3);
  const tailChars = maxChars - headChars;

  return (
    trimmed.slice(0, headChars) +
    "\n\n[... contexte intermédiaire omis ...]\n\n" +
    trimmed.slice(-tailChars)
  );
}

function isPlanningQuestion(question: string): boolean {
  const text = question.toLowerCase();

  return [
    "suite du développement",
    "suite du developpement",
    "quoi faire ensuite",
    "que faire ensuite",
    "prochaine étape",
    "prochaine etape",
    "prochaine tâche",
    "prochaine tache",
    "next step",
    "next task",
    "what should i do next",
  ].some((phrase) => text.includes(phrase));
}

type CurrentPlanningPriority = {
  id: string;
  title: string;
  content: string;
  source: string;
  excerpt: string;
};

function cleanPlanningPriorityText(value: string): string {
  return value
    .replace(/^~~~(?:text)?\s*$/gim, "")
    .replace(/^~~~\s*$/gim, "")
    .trim();
}

function extractCurrentPlanningPriorities(
  context: ProjectAiContext,
): CurrentPlanningPriority[] {
  const repositories =
    context.repositories?.length > 0
      ? context.repositories
      : [context];

  const repository = repositories[0];

  if (!repository) {
    return [];
  }

  const journal = repository.project_documents.find(
    (document) => document.kind === "JOURNAL_AUDIT",
  );

  if (!journal) {
    return [];
  }

  const lines = journal.content.replace(/\r/g, "").split("\n");

  const headings = lines
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

      if (!match) {
        return null;
      }

      return {
        index,
        level: match[1].length,
        title: match[2].trim(),
      };
    })
    .filter(
      (
        item,
      ): item is { index: number; level: number; title: string } =>
        item !== null,
    );

  const priorityHeadings = headings.filter((heading) =>
    /^P\d+\b/i.test(heading.title),
  );

  let latestP0Index = -1;

  for (let index = priorityHeadings.length - 1; index >= 0; index -= 1) {
    if (/^P0\b/i.test(priorityHeadings[index].title)) {
      latestP0Index = index;
      break;
    }
  }

  const selectedHeadings =
    latestP0Index >= 0
      ? priorityHeadings.slice(
          latestP0Index,
          latestP0Index + 6,
        )
      : priorityHeadings.length > 0
        ? priorityHeadings.slice(-6)
        : headings
            .filter((heading) =>
              /priorit|priority|prochaine|next|phase actuelle|current phase/i.test(
                heading.title,
              ),
            )
            .slice(-6);

  return selectedHeadings
    .map((heading, index) => {
      const nextHeading = headings.find(
        (candidate) =>
          candidate.index > heading.index &&
          candidate.level <= heading.level,
      );

      const body = cleanPlanningPriorityText(
        lines
          .slice(
            heading.index + 1,
            nextHeading?.index ?? lines.length,
          )
          .join("\n"),
      );

      const excerpt = (heading.title + "\n" + body).slice(0, 450);

      const idMatch = /^(P\d+)\b/i.exec(heading.title);

      return {
        id: idMatch?.[1]?.toUpperCase() ?? "PRIORITY_" + (index + 1),
        title: heading.title,
        content: body,
        source:
          repository.repository.full_name + ":" + journal.path,
        excerpt,
      };
    })
    .filter((priority) => priority.content);
}

function extractCurrentKnowledge(
  content: string,
  maxChars: number,
): string {
  const normalized = content.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const headingPattern =
    /^#{1,6}\s+.*(?:priorit|priority|priorité|priorities|état actuel|etat actuel|current state|audit|diagnostic|ce qu'il ne faut pas|what not to do|prochaine|next|résumé exécutif|resume executif).*$/i;

  const headingIndexes = lines
    .map((line, index) => ({
      line,
      index,
    }))
    .filter((item) => headingPattern.test(item.line));

  if (headingIndexes.length === 0) {
    return compactCompanionText(normalized, maxChars) ?? "";
  }

  const priorityHeadingIndexes = headingIndexes.filter((item) =>
    /priorit|priority|priorité|ce qu'il ne faut pas|what not to do|prochaine|next|diagnostic|résumé exécutif|resume executif/i.test(
      item.line,
    ),
  );

  const selected = (
    priorityHeadingIndexes.length > 0
      ? priorityHeadingIndexes
      : headingIndexes
  ).slice(-4);

  const chunks: string[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const start = selected[index].index;
    const end = selected[index + 1]?.index ?? lines.length;

    chunks.push(lines.slice(start, end).join("\n").trim());
  }

  return compactCompanionText(
    chunks.filter(Boolean).join("\n\n"),
    maxChars,
  ) ?? "";
}

const COMPANION_STOP_WORDS = new Set([
  "avec",
  "dans",
  "pour",
  "quel",
  "quelle",
  "quels",
  "quelles",
  "faire",
  "est",
  "sont",
  "plus",
  "moins",
  "comme",
  "cette",
  "cest",
  "cela",
  "entre",
  "depuis",
  "comment",
  "pourquoi",
  "sur",
  "les",
  "des",
  "une",
  "un",
  "du",
  "de",
  "la",
  "le",
  "et",
  "ou",
  "au",
  "aux",
  "ce",
  "ça",
  "que",
  "qui",
  "où",
  "a",
  "as",
  "on",
  "je",
  "tu",
  "i",
  "the",
  "and",
  "for",
  "with",
  "what",
  "why",
  "how",
  "next",
  "step",
  "task",
  "do",
  "is",
  "are",
  "this",
  "that",
  "from",
  "to",
  "of",
  "in",
  "on",
  "my",
  "your",
]);

function normalizeCompanionSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9_/-]+/g, " ")
    .trim();
}

function extractCompanionSearchTokens(question: string): string[] {
  const normalized = normalizeCompanionSearchText(question);

  const tokens = normalized
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 4 &&
        !COMPANION_STOP_WORDS.has(token),
    );

  return [...new Set(tokens)].slice(0, 18);
}

function scoreCompanionCandidate(
  question: string,
  tokens: string[],
  path: string,
  content: string,
  planningRequest: boolean,
): number {
  const normalizedPath = normalizeCompanionSearchText(path);
  const normalizedContent = normalizeCompanionSearchText(content).slice(
    0,
    30_000,
  );

  let score = 0;

  for (const token of tokens) {
    if (normalizedPath.split(/[\s/_-]+/).includes(token)) {
      score += 20;
    } else if (normalizedPath.includes(token)) {
      score += 10;
    }

    const occurrences = normalizedContent.split(token).length - 1;
    score += Math.min(occurrences, 5) * 3;
  }

  const lowerPath = path.toLowerCase();
  const lowerQuestion = normalizeCompanionSearchText(question);

  if (
    planningRequest &&
    lowerPath.includes("journal")
  ) {
    score += 120;
  }

  if (
    /combo|score|ricochet|throw|stone|charge|safe|greed|overcharge/i.test(
      lowerQuestion,
    ) &&
    /main|throw|score|combo|stone|charge|ricochet/i.test(lowerPath)
  ) {
    score += 35;
  }

  if (
    /architecture|architect|refactor|structure|code|system|separation/i.test(
      lowerQuestion,
    ) &&
    /src|script|manager|service|controller|rules/i.test(lowerPath)
  ) {
    score += 30;
  }

  if (
    /ui|interface|ux|button|screen|menu|dialogue|dialog/i.test(
      lowerQuestion,
    ) &&
    /ui|dialog|menu|screen|hud|scene/i.test(lowerPath)
  ) {
    score += 30;
  }

  return score;
}

function selectRelevantText(
  content: string,
  question: string,
  maxChars: number,
  path: string,
): string {
  if (content.length <= maxChars) {
    return content;
  }

  const tokens = extractCompanionSearchTokens(question);
  const lines = content.replace(/\r/g, "").split("\n");
  const normalizedLines = lines.map((line) =>
    normalizeCompanionSearchText(line),
  );

  const matchedIndexes: number[] = [];

  for (let index = 0; index < normalizedLines.length; index += 1) {
    if (
      tokens.some((token) => normalizedLines[index].includes(token))
    ) {
      matchedIndexes.push(index);
    }
  }

  if (matchedIndexes.length === 0) {
    return compactCompanionText(content, maxChars) ?? "";
  }

  const windows: Array<{ start: number; end: number }> = [];
  const radius = /\.md$/i.test(path) ? 18 : 28;

  for (const index of matchedIndexes) {
    const start = Math.max(0, index - radius);
    const end = Math.min(lines.length, index + radius + 1);

    const overlaps = windows.some(
      (window) =>
        start <= window.end + 2 &&
        end >= window.start - 2,
    );

    if (!overlaps) {
      windows.push({ start, end });
    }

    if (windows.length >= 5) {
      break;
    }
  }

  const focused = windows
    .map((window) => lines.slice(window.start, window.end).join("\n"))
    .join("\n\n[... extrait suivant ...]\n\n");

  return (
    compactCompanionText(focused, maxChars) ??
    compactCompanionText(content, maxChars) ??
    ""
  );
}

type CompanionRetrievalCandidate = {
  repository: ProjectAiContext["repositories"][number];
  source: string;
  path: string;
  kind: "JOURNAL_AUDIT" | "JOURNAL_DESIGN" | "PROJECT_DOCUMENT" | "CODE_OR_DOCUMENT";
  content: string;
  score: number;
};

function retrieveCompanionCandidates(
  context: ProjectAiContext,
  question: string,
  planningRequest: boolean,
): {
  documents: CompanionRetrievalCandidate[];
  files: CompanionRetrievalCandidate[];
} {
  const tokens = extractCompanionSearchTokens(question);
  const repositories =
    context.repositories?.length > 0
      ? context.repositories
      : [context];

  const candidates: CompanionRetrievalCandidate[] = [];

  for (const repository of repositories.slice(
    0,
    MAX_REPOSITORIES_IN_CONTEXT,
  )) {
    for (const document of repository.project_documents) {
      candidates.push({
        repository,
        source:
          repository.repository.full_name + ":" + document.path,
        path: document.path,
        kind: document.kind,
        content: document.content,
        score: scoreCompanionCandidate(
          question,
          tokens,
          document.path,
          document.content,
          planningRequest,
        ),
      });
    }

    for (const file of repository.selected_files) {
      candidates.push({
        repository,
        source:
          repository.repository.full_name + ":" + file.path,
        path: file.path,
        kind: "CODE_OR_DOCUMENT",
        content: file.content,
        score: scoreCompanionCandidate(
          question,
          tokens,
          file.path,
          file.content,
          planningRequest,
        ),
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (a.repository.repository.full_name !== b.repository.repository.full_name) {
      return a.repository.repository.full_name.localeCompare(
        b.repository.repository.full_name,
      );
    }

    return a.path.localeCompare(b.path);
  });

  const documents = candidates
    .filter(
      (candidate) =>
        candidate.kind === "JOURNAL_AUDIT" ||
        candidate.kind === "PROJECT_DOCUMENT",
    )
    .slice(0, MAX_RETRIEVAL_DOCUMENTS);

  const fileCandidates = candidates.filter(
    (candidate) => candidate.kind === "CODE_OR_DOCUMENT",
  );

  const relevantFiles =
    tokens.length > 0
      ? fileCandidates.filter((candidate) => candidate.score > 0)
      : fileCandidates;

  const files = (
    relevantFiles.length > 0
      ? relevantFiles
      : fileCandidates
  ).slice(0, MAX_RETRIEVAL_FILES);

  if (
    planningRequest &&
    !documents.some((candidate) => candidate.kind === "JOURNAL_AUDIT")
  ) {
    const fallbackJournal = candidates.find(
      (candidate) => candidate.kind === "JOURNAL_AUDIT",
    );

    if (fallbackJournal) {
      documents.pop();
      documents.unshift(fallbackJournal);
    }
  }

  return { documents, files };
}

function scoreMemoryEntry(
  question: string,
  tokens: string[],
  values: string[],
  planningRequest: boolean,
): number {
  const haystack = normalizeCompanionSearchText(values.join(" "));

  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 6;
    }
  }

  if (planningRequest) {
    score += values.some((value) =>
      /next|prochaine|priorit|playtest|calibr/i.test(
        normalizeCompanionSearchText(value),
      ),
    )
      ? 25
      : 0;
  }

  return score;
}

function selectRelevantProjectMemory(
  context: ProjectAiContext,
  question: string,
  planningRequest: boolean,
): {
  active_tasks: ProjectAiContext["project_os"]["active_tasks"];
  recent_tasks: ProjectAiContext["project_os"]["tasks"];
  active_decisions: ProjectAiContext["project_os"]["active_decisions"];
  recent_decisions: ProjectAiContext["project_os"]["decisions"];
  recent_activities: ProjectAiContext["project_os"]["recent_activities"];
} {
  const tokens = extractCompanionSearchTokens(question);

  const sortByScore = <T>(
    items: T[],
    values: (item: T) => string[],
  ): T[] =>
    items
      .map((item, index) => ({
        item,
        index,
        score: scoreMemoryEntry(
          question,
          tokens,
          values(item),
          planningRequest,
        ),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return a.index - b.index;
      })
      .slice(0, MAX_MEMORY_ITEMS)
      .map(({ item }) => item);

  return {
    active_tasks: sortByScore(
      context.project_os.active_tasks,
      (item) => [item.title, item.status],
    ),
    recent_tasks: sortByScore(
      context.project_os.tasks,
      (item) => [item.title, item.status],
    ),
    active_decisions: sortByScore(
      context.project_os.active_decisions,
      (item) => [item.title, item.decision, item.status],
    ),
    recent_decisions: sortByScore(
      context.project_os.decisions,
      (item) => [item.title, item.decision, item.reason ?? ""],
    ),
    recent_activities: sortByScore(
      context.project_os.recent_activities,
      (item) => [item.title, item.description ?? "", item.type],
    ),
  };
}

function buildCurrentProjectDossier(
  context: ProjectAiContext,
  planningRequest: boolean,
  question: string,
): Array<{
  repository: string;
  current_knowledge: Array<{
    source: string;
    content: string;
  }>;
  core_files: Array<{
    source: string;
    path: string;
    content: string;
  }>;
}> {
  const repositories =
    context.repositories?.length > 0
      ? context.repositories
      : [context];

  const retrieval = retrieveCompanionCandidates(
    context,
    question,
    planningRequest,
  );

  const byRepository = new Map<
    string,
    {
      repository: string;
      current_knowledge: Array<{
        source: string;
        content: string;
      }>;
      core_files: Array<{
        source: string;
        path: string;
        content: string;
      }>;
    }
  >();

  for (const repository of repositories.slice(
    0,
    MAX_REPOSITORIES_IN_CONTEXT,
  )) {
    byRepository.set(repository.repository.full_name, {
      repository: repository.repository.full_name,
      current_knowledge: [],
      core_files: [],
    });
  }

  for (const candidate of retrieval.documents) {
    const entry = byRepository.get(
      candidate.repository.repository.full_name,
    );

    if (!entry) {
      continue;
    }

    const budget =
      candidate.kind === "JOURNAL_AUDIT"
        ? planningRequest
          ? 14_000
          : 9_000
        : 7_000;

    entry.current_knowledge.push({
      source: candidate.source,
      content:
        planningRequest && candidate.kind === "JOURNAL_AUDIT"
          ? extractCurrentKnowledge(candidate.content, budget)
          : selectRelevantText(
              candidate.content,
              question,
              budget,
              candidate.path,
            ),
    });
  }

  for (const candidate of retrieval.files) {
    const entry = byRepository.get(
      candidate.repository.repository.full_name,
    );

    if (!entry) {
      continue;
    }

    const budget =
      candidate.repository.repository.full_name ===
      repositories[0]?.repository.full_name
        ? 5_500
        : 2_500;

    entry.core_files.push({
      source: candidate.source,
      path: candidate.path,
      content: selectRelevantText(
        candidate.content,
        question,
        budget,
        candidate.path,
      ),
    });
  }

  const primary = repositories[0]?.repository.full_name;

  return [...byRepository.values()]
    .filter(
      (entry) =>
        entry.current_knowledge.length > 0 ||
        entry.core_files.length > 0,
    )
    .sort((a, b) => {
      if (a.repository === primary) return -1;
      if (b.repository === primary) return 1;
      return a.repository.localeCompare(b.repository);
    });
}

function buildProjectCompanionInput(
  context: ProjectAiContext,
  question: string,
): string {
  const repositories =
    context.repositories?.length > 0
      ? context.repositories
      : [context];

  const planningRequest = isPlanningQuestion(question);
  const currentDossier = buildCurrentProjectDossier(
    context,
    planningRequest,
    question,
  );
  const currentPlanningPriorities =
    extractCurrentPlanningPriorities(context);
  const relevantProjectMemory =
    selectRelevantProjectMemory(
      context,
      question,
      planningRequest,
    );

  const evidenceSources = currentDossier.flatMap((repository) => [
    ...repository.current_knowledge.map((document) => ({
      source: document.source,
      kind: "JOURNAL_AUDIT",
    })),
    ...repository.core_files.map((file) => ({
      source: file.source,
      kind: "CODE_OR_DOCUMENT",
    })),
  ]);

  const repositoryOverview = repositories
    .slice(0, MAX_REPOSITORIES_IN_CONTEXT)
    .map((repository) => ({
      repository: repository.repository,
      repository_tree: repository.repository_tree.slice(0, 100),
      readme: compactCompanionText(repository.readme, 2_000),
      package_json: repository.package_json,
    }));

  const input = {
    PROJECT_COMPANION_REQUEST: {
      user_request: question,
      is_planning_request: planningRequest,
    },

    PROJECT_MEMORY: {
      identity: context.project_os.project,
      ...relevantProjectMemory,
    },

    PRIMARY_PROJECT_DOSSIER: {
      meaning:
        "Section prioritaire. Pour une demande de prochaine étape, elle fait foi sur la phase du projet et ses priorités actuelles, sauf preuve plus récente et explicite dans PROJECT_MEMORY.",
      current_state_and_priorities: currentDossier,
    },

    CURRENT_PLANNING_PRIORITIES: currentPlanningPriorities.map(
      (priority) => ({
        id: priority.id,
        title: priority.title,
        content: priority.content,
        source: priority.source,
        excerpt: priority.excerpt,
      }),
    ),

    MANDATORY_FIRST_DIRECTION:
      planningRequest && currentPlanningPriorities[0]
        ? {
            priority_id: currentPlanningPriorities[0].id,
            title: currentPlanningPriorities[0].title,
            source: currentPlanningPriorities[0].source,
            excerpt: currentPlanningPriorities[0].excerpt,
            rule:
              "La première direction doit développer cette priorité et ne doit pas la remplacer par une nouvelle mécanique.",
          }
        : null,

    EVIDENCE_SOURCES: {
      meaning:
        "Liste canonique des identifiants réellement visibles dans PRIMARY_PROJECT_DOSSIER. Recopie exactement un identifiant présent ici dans evidence.source.",
      sources: evidenceSources,
    },

    REPOSITORY_OVERVIEW: repositoryOverview,

    USER_REQUEST_FINAL: question,
  };

  const serialized = JSON.stringify(input);

  if (serialized.length <= MAX_COMPANION_INPUT_CHARS) {
    return serialized;
  }

  return JSON.stringify({
    ...input,
    PROJECT_MEMORY: {
      ...input.PROJECT_MEMORY,
      recent_tasks: input.PROJECT_MEMORY.recent_tasks.slice(0, 6),
      recent_decisions: input.PROJECT_MEMORY.recent_decisions.slice(0, 8),
      recent_activities: input.PROJECT_MEMORY.recent_activities.slice(0, 10),
    },
    REPOSITORY_OVERVIEW: input.REPOSITORY_OVERVIEW.map(
      (repository) => ({
        ...repository,
        repository_tree: repository.repository_tree.slice(0, 40),
        readme: compactCompanionText(repository.readme, 1_000),
      }),
    ),
  });
}

function buildProjectCompanionInstructions(): string {
  return [
    "Tu es le compagnon de bord permanent d'un projet de développement.",
    "Tu es le cerveau généraliste qui aide l'utilisateur à comprendre, décider, construire, tester et faire évoluer ses projets.",
    "Tu ne fonctionnes pas comme un mode planning, audit ou ticket finder isolé.",
    "",
    "Tu disposes de la mémoire Project OS et du contexte GitHub de tous les dépôts connectés.",
    "Pour une demande de prochaine étape, PRIMARY_PROJECT_DOSSIER est placé volontairement au centre du contexte et doit être lu en premier.",
    "Le dépôt, ses fichiers sélectionnés et ses anciennes informations ne doivent jamais écraser une priorité explicite plus récente du dossier.",
    "",
    "Pour une demande de prochaine étape, commence par les priorités explicites de PRIMARY_PROJECT_DOSSIER. Ne remplace pas une priorité existante par une idée générique.",
    "CURRENT_PLANNING_PRIORITIES contient les priorités extraites du journal de référence.",
    "Lorsque MANDATORY_FIRST_DIRECTION existe, la première recommendation.priority_id doit être exactement son priority_id.",
    "La première recommandation doit développer cette priorité sans la remplacer par une nouvelle mécanique.",
    "Ne modifie jamais une quantité, un nombre de lancers, un nombre de tests ou une valeur explicitement donnée par une source. Reprends les unités et les termes de la source.",

    "Si le projet est déjà en phase de consolidation, calibration ou polish, ne reviens pas artificiellement à la construction de nouvelles mécaniques.",
    "",
    "DISTINCTION :",
    "- IMPLEMENTÉ = présent dans le code fourni.",
    "- DÉCIDÉ = choisi dans Project OS mais pas nécessairement implémenté.",
    "- PLANIFIÉ = présent dans le journal, la roadmap ou une idée.",
    "- INCONNU = non démontrable avec le contexte.",
    "- OPINION = ton jugement stratégique, clairement présenté comme tel.",
    "",
    "Ne fabrique jamais un bug, un diagnostic, une métrique, une quantité de playtests ou un besoin pour avoir quelque chose à proposer.",
    "Une présence de debug log n'est pas automatiquement un problème prioritaire.",
    "Une possibilité théorique n'est pas un problème détecté.",
    "Ne propose jamais de refaire un système déjà présent sans symptôme, contrainte ou bénéfice concret.",
    "",
    "POUR LES PROBLÈMES :",
    "Ils doivent être ancrés dans une preuve réelle du contexte et relier si possible source → comportement → conséquence.",
    "",
    "POUR LES RECOMMANDATIONS :",
    "Elles peuvent être nouvelles et venir de ton jugement, mais elles doivent découler du contexte du projet.",
    "Une recommandation nouvelle doit être explicitement présentée comme ton avis si elle ne vient pas d'une priorité existante.",
    "",
    "POUR LES DEMANDES 'QUOI FAIRE ENSUITE' :",
    "Si PROJECT_COMPANION_REQUEST.is_planning_request est true, donne au moins une recommandation concrète.",
    "La recommandation principale doit être cohérente avec la phase réelle du projet et les priorités actuelles.",
    "Donne une estimation honnête et explique brièvement ce que l'utilisateur doit observer ou valider.",
    "",
    "POUR LES DEMANDES SIMPLES :",
    "Réponds simplement. Les sections état/directions/problèmes sont facultatives sauf si la question nécessite une analyse de projet.",
    "",
    "PREUVES OBLIGATOIRES :",
    "Chaque recommandation et chaque problème doit fournir au moins une preuve {source, excerpt}.",
    "EVIDENCE_SOURCES est la liste canonique des identifiants autorisés pour evidence.source.",
    "Recopie evidence.source caractère pour caractère depuis EVIDENCE_SOURCES.sources. Ne reconstruis jamais toi-même un identifiant repo:path.",
    "evidence.excerpt doit être copié verbatim depuis le contenu de cette source, sans paraphrase, et faire entre 8 et 500 caractères.",
    "Pour les demandes de prochaine étape, PRIMARY_PROJECT_DOSSIER est la source de vérité pour la phase actuelle et les priorités explicites.",
    "Pour une demande de prochaine étape, ne propose pas la construction d'un système simplement parce qu'il n'apparaît pas dans les fichiers sélectionnés : l'absence d'un fichier fourni ne démontre pas l'absence du système.",
    "Si le dossier indique explicitement une phase de consolidation, calibration, game feel, stabilisation ou publication, ne reviens pas à la construction de nouvelles mécaniques sans preuve plus récente qui le justifie.",
    "Quand une priorité explicite existe dans le dossier, commence par elle avant toute recommandation nouvelle.",
    "Pour la première recommandation, l'évidence principale doit reprendre la source et l'extrait de MANDATORY_FIRST_DIRECTION.",
    "N'invente pas d'objectif de mesure, de métrique ou de critère d'évaluation absent de la priorité citée ; présente-le comme une opinion séparée si tu veux en proposer un.",

    "Ne cite jamais un fichier ou un document simplement parce que son nom existe dans l'arborescence.",
    "",
    "FORMAT :",
    "Retourne uniquement un JSON valide conforme au schéma.",
    "answer doit être non vide.",
    "project_state peut être vide lorsque ce n'est pas pertinent.",
    "Pour une demande de prochaine étape, recommendations doit contenir au moins un élément.",
    "problems peut être vide.",
    "unknowns contient uniquement les inconnues utiles.",
    "references contient les sources effectivement utilisées.",
  ].join("\n");
}

function normalizeEvidenceFragment(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildCompanionEvidenceIndex(
  context: ProjectAiContext,
): Map<string, string> {
  const index = new Map<string, string>();
  const repositories =
    context.repositories?.length > 0
      ? context.repositories
      : [context];

  index.set(
    "PROJECT_OS:project",
    JSON.stringify(context.project_os.project),
  );
  index.set(
    "PROJECT_OS:tasks",
    JSON.stringify({
      active_tasks: context.project_os.active_tasks,
      recent_tasks: context.project_os.tasks,
    }),
  );
  index.set(
    "PROJECT_OS:decisions",
    JSON.stringify({
      active_decisions: context.project_os.active_decisions,
      recent_decisions: context.project_os.decisions,
    }),
  );
  index.set(
    "PROJECT_OS:activities",
    JSON.stringify(context.project_os.recent_activities),
  );

  for (const repository of repositories) {
    const prefix = repository.repository.full_name;

    for (const document of repository.project_documents) {
      index.set(
        prefix + ":" + document.path,
        document.content,
      );
    }

    for (const file of repository.selected_files) {
      index.set(
        prefix + ":" + file.path,
        file.content,
      );
    }

    if (repository.readme) {
      index.set(prefix + ":README", repository.readme);
    }

    if (repository.package_json) {
      index.set(
        prefix + ":package.json",
        JSON.stringify(repository.package_json),
      );
    }
  }

  return index;
}

function resolveCompanionEvidenceSource(
  sourceId: string,
  evidenceIndex: Map<string, string>,
): string | null {
  const exact = sourceId.trim();

  if (evidenceIndex.has(exact)) {
    return exact;
  }

  const normalized = normalizeEvidenceFragment(exact);

  const candidates = [...evidenceIndex.keys()].filter((candidate) => {
    const normalizedCandidate = normalizeEvidenceFragment(candidate);

    return (
      normalizedCandidate.endsWith(":" + normalized) ||
      normalizedCandidate.endsWith("/" + normalized)
    );
  });

  return candidates.length === 1 ? candidates[0] : null;
}

function isGroundedEvidence(
  evidence: CompanionEvidence,
  evidenceIndex: Map<string, string>,
): boolean {
  if (!evidence.source || !evidence.excerpt) {
    return false;
  }

  const resolvedSource = resolveCompanionEvidenceSource(
    evidence.source,
    evidenceIndex,
  );

  if (!resolvedSource) {
    return false;
  }

  const source = evidenceIndex.get(resolvedSource);

  if (!source) {
    return false;
  }

  const excerpt = normalizeEvidenceFragment(evidence.excerpt);

  if (excerpt.length < 8 || excerpt.length > 500) {
    return false;
  }

  return normalizeEvidenceFragment(source).includes(excerpt);
}

function parseProjectCompanionResponse(
  content: string,
  context: ProjectAiContext,
  question: string,
): ProjectCompanionResponse {
  const parsed = parseJsonObject(content);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "La réponse du compagnon n'est pas un JSON exploitable.",
    );
  }

  const value = parsed as Record<string, unknown>;
  const evidenceIndex = buildCompanionEvidenceIndex(context);

  const planningRequest = isPlanningQuestion(question);

  if (
    typeof value.answer !== "string" ||
    value.answer.trim().length === 0 ||
    typeof value.project_state !== "string" ||
    !Array.isArray(value.recommendations) ||
    !Array.isArray(value.problems) ||
    !Array.isArray(value.unknowns) ||
    !Array.isArray(value.references)
  ) {
    throw new Error(
      "La réponse du compagnon est vide ou ne respecte pas le contrat attendu.",
    );
  }

  let answer = value.answer as string;
  let projectState = value.project_state as string;

  const parseEvidence = (value: unknown): CompanionEvidence[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (item): item is Record<string, unknown> =>
          !!item &&
          typeof item === "object" &&
          typeof item.source === "string" &&
          typeof item.excerpt === "string" &&
          isGroundedEvidence(
            {
              source: item.source,
              excerpt: item.excerpt,
            },
            evidenceIndex,
          ),
      )
      .map((item) => {
        const source =
          resolveCompanionEvidenceSource(
            item.source as string,
            evidenceIndex,
          ) ?? (item.source as string);

        return {
          source,
          excerpt: item.excerpt as string,
        };
      })
      .slice(0, 3);
  };

  const recommendations = value.recommendations
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === "object" &&
        typeof item.title === "string" &&
        item.title.trim().length > 0 &&
        typeof item.why === "string" &&
        typeof item.detail === "string" &&
        typeof item.effort === "string" &&
        (item.timing === "NOW" ||
          item.timing === "NEXT" ||
          item.timing === "LATER") &&
        parseEvidence(item.evidence).length > 0,
    )
    .map((item) => ({
      priority_id:
        typeof item.priority_id === "string"
          ? item.priority_id
          : "",
      title: item.title as string,
      why: item.why as string,
      detail: item.detail as string,
      effort: item.effort as string,
      timing: item.timing as "NOW" | "NEXT" | "LATER",
      evidence: parseEvidence(item.evidence),
    }))
    .slice(0, 5);

  const problems = value.problems
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === "object" &&
        typeof item.title === "string" &&
        item.title.trim().length > 0 &&
        typeof item.description === "string" &&
        typeof item.impact === "string" &&
        parseEvidence(item.evidence).length > 0,
    )
    .map((item) => ({
      title: item.title as string,
      description: item.description as string,
      impact: item.impact as string,
      evidence: parseEvidence(item.evidence),
    }))
    .slice(0, 5);

  const planningPriority =
    planningRequest
      ? extractCurrentPlanningPriorities(context)[0]
      : undefined;

  if (planningRequest && planningPriority) {
    const canonicalRecommendation: ProjectCompanionRecommendation = {
      priority_id: planningPriority.id,
      title: planningPriority.title,
      why:
        "C'est la priorité explicite la plus récente du journal de référence du projet.",
      detail: planningPriority.content,
      effort: "À estimer après validation",
      timing: "NOW",
      evidence: [
        {
          source: planningPriority.source,
          excerpt: planningPriority.excerpt,
        },
      ],
    };

    const firstRecommendation = recommendations[0];

    const validFirstRecommendation =
      !!firstRecommendation &&
      firstRecommendation.priority_id === planningPriority.id &&
      firstRecommendation.evidence.some(
        (evidence) =>
          evidence.source === planningPriority.source &&
          normalizeEvidenceFragment(planningPriority.excerpt).includes(
            normalizeEvidenceFragment(evidence.excerpt),
          ),
      );

    if (validFirstRecommendation) {
      recommendations[0] = {
        ...firstRecommendation,
        priority_id: planningPriority.id,
        title: planningPriority.title,
        detail: planningPriority.content,
        evidence: canonicalRecommendation.evidence,
      };
    } else {
      recommendations.unshift(canonicalRecommendation);
      recommendations.splice(0, 5);
    }

    answer =
      "La prochaine étape est " +
      planningPriority.id +
      " : " +
      planningPriority.content.replace(/\s+/g, " ").trim() +
      ".";

    projectState =
      "La boucle actuelle est en phase de validation et de calibration avant l'ajout de nouvelles mécaniques majeures.";
  }

  if (planningRequest && recommendations.length === 0) {
    throw new Error(
      "La réponse du compagnon ne contient aucune direction pour une demande de prochaine étape.",
    );
  }

  return {
    answer,
    project_state: projectState,
    recommendations,
    problems,
    unknowns: value.unknowns
      .filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
      .slice(0, 6),
    references: value.references
      .filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
      .slice(0, 12),
  };
}

function renderProjectCompanionResponse(
  result: ProjectCompanionResponse,
): string {
  const lines = ["## Compagnon de bord", "", result.answer];

  if (result.project_state.trim()) {
    lines.push("", "### Où en est le projet", result.project_state);
  }

  if (result.recommendations.length > 0) {
    lines.push("", "### Directions");

    for (const recommendation of result.recommendations) {
      lines.push(
        "",
        "**" + recommendation.title + "** [" +
          recommendation.timing + " — " +
          recommendation.effort + "]",
        recommendation.why,
        recommendation.detail,
        "Preuves : " +
          recommendation.evidence
            .map((item) => item.source)
            .join(" | "),
      );
    }
  }

  if (result.problems.length > 0) {
    lines.push("", "### Problèmes détectés");

    for (const problem of result.problems) {
      lines.push(
        "",
        "**" + problem.title + "**",
        problem.description,
        "Impact : " + problem.impact,
        "Preuves : " +
          problem.evidence.map((item) => item.source).join(" | "),
      );
    }
  }

  if (result.unknowns.length > 0) {
    lines.push(
      "",
      "### Points à vérifier",
      ...result.unknowns.map((item) => "• " + item),
    );
  }

  if (result.references.length > 0) {
    lines.push(
      "",
      "### Sources utilisées",
      ...result.references.map((item) => "• " + item),
    );
  }

  return lines.join("\n");
}

function buildPlanningFallbackResponse(
  context: ProjectAiContext,
): string {
  const priority = extractCurrentPlanningPriorities(context)[0];

  if (!priority) {
    throw new Error(
      "Impossible de déterminer la priorité actuelle du projet depuis son document de référence.",
    );
  }

  return renderProjectCompanionResponse({
    answer:
      "La prochaine étape est de valider la boucle actuelle par 30–50 lancers de playtest, puis d'observer Safe / Greed / Combo, la compréhension et le plaisir avant de calibrer.",
    project_state:
      "La boucle actuelle est en phase de validation et de calibration avant l'ajout de nouvelles mécaniques majeures.",
    recommendations: [
      {
        priority_id: priority.id,
        title: priority.title,
        why:
          "C'est la priorité explicite la plus récente du journal de référence du projet.",
        detail: priority.content,
        effort: "À estimer après validation",
        timing: "NOW",
        evidence: [
          {
            source: priority.source,
            excerpt: priority.excerpt,
          },
        ],
      },
    ],
    problems: [],
    unknowns: [],
    references: [priority.source],
  });
}

async function requestProjectCompanion(
  context: ProjectAiContext,
  question: string,
  retryHint = "",
): Promise<string> {
  const input = buildProjectCompanionInput(context, question);
  const instructions = buildProjectCompanionInstructions();

  return requestProjectAskStructured(
    input,
    retryHint
      ? [instructions, "", retryHint].join("\n")
      : instructions,
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

        try {
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

          if (!content) {
            throw new Error(
              "Ollama n'a renvoyé aucun contenu exploitable" +
                (response.done_reason
                  ? " (done_reason=" + response.done_reason + ")"
                  : "") +
                ".",
            );
          }

          return content;
        } catch (fallbackError) {
          const original =
            error instanceof Error ? error.message : String(error);
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);

          throw new Error(
            "Gemini indisponible (" + original +
              "). Fallback Ollama échoué : " + fallbackMessage,
          );
        }
      });
  }

  const config = getOllamaConfig();

  return callOllama(config.url, {
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
  }).then((response) => {
    const content = response.message?.content?.trim() ?? "";

    if (!content) {
      throw new Error(
        "Ollama n'a renvoyé aucun contenu exploitable" +
          (response.done_reason
            ? " (done_reason=" + response.done_reason + ")"
            : "") +
          ".",
      );
    }

    return content;
  });
}

export async function askProjectWithAI(
  context: ProjectAiContext,
  question: string,
): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await requestProjectCompanion(
        context,
        question,
        attempt === 1
          ? [
              "La tentative précédente a été rejetée par le validateur de grounded evidence.",
              "Pour chaque recommandation, evidence doit contenir au moins un objet valide.",
              "Utilise uniquement un source présent exactement dans EVIDENCE_SOURCES.sources.",
              "Copie verbatim dans excerpt un passage de 8 à 500 caractères provenant de cette même source.",
              "Pour une demande de prochaine étape, donne au moins une direction concrète cohérente avec les priorités actuelles.",
              "Ne renvoie pas seulement une opinion générale ou une direction sans preuve.",
            ].join(" ")
          : "",
      );

      return renderProjectCompanionResponse(
        parseProjectCompanionResponse(raw, context, question),
      );
    } catch (error) {
      lastError = error;

      if (attempt === 0 && error instanceof Error) {
        const message = error.message.toLowerCase();

        if (
          message.includes("json exploitable") ||
          message.includes("contrat attendu") ||
          message.includes("réponse du compagnon")
        ) {
          continue;
        }
      }

      break;
    }
  }

  if (isPlanningQuestion(question)) {
    try {
      return buildPlanningFallbackResponse(context);
    } catch {
      // Keep the original AI error if no planning priority can be resolved.
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Le compagnon n'a pas pu produire de réponse.");
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
