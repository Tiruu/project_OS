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
    current_state: { type: "string" },
    confidence: { type: "number" },
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
        },
        required: ["title", "priority", "reason"],
      },
    },
  },
  required: [
    "summary",
    "purpose",
    "type",
    "technologies",
    "current_state",
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

  const instructions = `
Tu es l'analyste de Project OS.

Ta mission est d'analyser un dépôt GitHub à partir des éléments fournis et de produire une fiche de projet utile à un développeur solo.

Règles :
- Ne prétends pas connaître ce qui n'est pas visible dans les données.
- Si l'état réel du projet est incertain, indique-le clairement.
- Le champ current_state doit rester factuel et prudent.
- Le champ type doit décrire la nature du projet.
- technologies doit contenir uniquement des technologies raisonnablement déduites des données.
- purpose explique pourquoi le projet semble exister, pas seulement ce qu'il contient.
- suggested_tasks doit proposer au maximum 5 tâches concrètes, directement déduites de l'état observé.
- Ne crée aucune tâche automatiquement : tu fais des propositions.
- confidence est un nombre entre 0 et 1.
- uncertainties contient les points que Project OS devrait vérifier.
- Réponds strictement selon le JSON schema fourni.
`;

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
            content: `Analyse ce dépôt GitHub pour Project OS :\n\n${input}`,
          },
        ],
        options: {
          temperature: 0,
        },
      }),
    });
  } catch (error) {
    throw new Error(
      `Impossible de joindre Ollama sur ${url}. Vérifie qu'Ollama est lancé et que le modèle "${model}" est installé.`,
    );
  }

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Ollama API ${response.status} : ${body.slice(0, 500)}`,
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
    return JSON.parse(outputText) as AiReview;
  } catch {
    throw new Error(
      "Ollama a répondu avec un JSON invalide.",
    );
  }
}
