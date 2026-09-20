import "dotenv/config";

import type { AiReview } from "../types/aiReview.js";
import type { GithubRepositoryContext } from "./githubContextService.js";

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    purpose: { type: "string" },
    type: { type: "string" },
    technologies: {
      type: "array",
      items: { type: "string" },
    },
    inferred_state: { type: "string" },
    state_evidence: {
      type: "array",
      items: { type: "string" },
    },
    observed_features: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          evidence: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["name", "description", "evidence"],
      },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    uncertainties: {
      type: "array",
      items: { type: "string" },
    },
    suggested_tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          priority: { type: "integer" },
          reason: { type: "string" },
          evidence: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
        required: [
          "title",
          "priority",
          "reason",
          "evidence",
          "confidence",
        ],
      },
    },
  },
  required: [
    "summary",
    "purpose",
    "type",
    "technologies",
    "inferred_state",
    "state_evidence",
    "observed_features",
    "confidence",
    "uncertainties",
    "suggested_tasks",
  ],
} as const;

type OllamaChatResponse = {
  message?: {
    role?: string;
    content?: string;
  };
};

function getOllamaConfig(): {
  url: string;
  model: string;
} {
  return {
    url:
      process.env.OLLAMA_URL?.trim() ||
      "http://localhost:11434/api/chat",
    model:
      process.env.OLLAMA_MODEL?.trim() ||
      "qwen3:4b",
  };
}

export async function reviewProjectWithAI(
  context: GithubRepositoryContext,
): Promise<AiReview> {
  const { url, model } = getOllamaConfig();

  const instructions = [
    "Tu es l'analyste technique de Project OS.",
    "",
    "Ta mission est de comprendre un dépôt GitHub pour un développeur solo, puis de produire une analyse fondée sur des preuves présentes dans les données fournies.",
    "",
    "Hiérarchie de confiance des sources :",
    "1. contenu réel des fichiers sélectionnés",
    "2. README et documentation",
    "3. structure du dépôt",
    "4. package/configuration",
    "5. historique GitHub",
    "6. métadonnées du dépôt",
    "7. données déjà stockées dans Project OS",
    "",
    "Règles impératives :",
    "- N'affirme jamais qu'une fonctionnalité existe uniquement parce que son nom est suggéré par un dossier, un commit ou une description.",
    "- Chaque fonctionnalité observée doit citer au moins un fichier présent dans selected_files ou repository_tree.",
    "- Ne confonds jamais l'état administratif de Project OS avec l'état réel du projet.",
    "- inferred_state est ton estimation de l'état réel du projet. Le current_state fourni par Project OS est seulement un indice historique.",
    "- state_evidence doit citer les éléments qui justifient inferred_state.",
    "- technologies doit contenir uniquement les technologies réellement observables ou très solidement déduites.",
    "- purpose décrit le but probable du projet à partir des preuves disponibles.",
    "- observed_features doit lister 2 à 8 fonctionnalités ou sous-systèmes réellement observables quand c'est possible.",
    "- suggested_tasks doit contenir au maximum 5 tâches concrètes et spécifiques au dépôt.",
    "- Une tâche doit être directement justifiée par les preuves disponibles.",
    "- Interdis les recommandations vagues du type 'ajouter des tests', 'améliorer les performances' ou 'mettre à jour les dépendances' sans preuve spécifique.",
    "- Chaque tâche doit citer au moins une preuve.",
    "- confidence est entre 0 et 1.",
    "- uncertainties doit signaler ce qui reste réellement inconnu.",
    "- Ne crée aucune tâche automatiquement : tu proposes seulement.",
    "- Réponds strictement selon le JSON schema fourni.",
    "",
    "Contrainte importante :",
    "Le fait qu'un dépôt soit privé ne signifie pas que les données sont inaccessibles. Analyse uniquement les données effectivement fournies par Project OS.",
  ].join("\n");

  const input = JSON.stringify(context);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: reviewSchema,
        messages: [
          {
            role: "system",
            content: instructions,
          },
          {
            role: "user",
            content:
              "Analyse ce dépôt GitHub pour Project OS :\n\n" +
              input,
          },
        ],
        options: {
          temperature: 0,
        },
      }),
    });
  } catch {
    throw new Error(
      "Impossible de joindre Ollama sur " +
        url +
        ". Vérifie qu'Ollama est lancé et que le modèle \"" +
        model +
        "\" est installé.",
    );
  }

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      "Ollama API " +
        response.status +
        " : " +
        body.slice(0, 500),
    );
  }

  const data =
    (await response.json()) as OllamaChatResponse;

  const outputText = data.message?.content;

  if (!outputText) {
    throw new Error(
      "Ollama n'a renvoyé aucun contenu exploitable.",
    );
  }

  try {
    const parsed = JSON.parse(outputText) as AiReview;

    if (
      typeof parsed.confidence !== "number" ||
      parsed.confidence < 0 ||
      parsed.confidence > 1
    ) {
      throw new Error("confidence invalide");
    }

    return parsed;
  } catch {
    throw new Error(
      "Ollama a répondu avec un JSON invalide ou incohérent.",
    );
  }
}
