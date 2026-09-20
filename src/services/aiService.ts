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

function requireOpenAiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY manquant dans .env. Project OS ne peut pas lancer l'analyse IA.",
    );
  }

  return apiKey;
}

function extractOutputText(response: {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}): string {
  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;

  if (!text) {
    throw new Error("La réponse IA ne contient aucun texte exploitable.");
  }

  return text;
}

export async function reviewProjectWithAI(
  context: GithubRepositoryContext,
): Promise<AiReview> {
  const apiKey = requireOpenAiKey();
  const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyse ce dépôt GitHub pour Project OS :\n\n${input}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "project_review",
          description: "Analyse structurée d'un projet GitHub",
          strict: true,
          schema: reviewSchema,
        },
      },
      max_output_tokens: 1400,
    }),
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `OpenAI API ${response.status} : ${body.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const outputText = extractOutputText(data);

  try {
    return JSON.parse(outputText) as AiReview;
  } catch {
    throw new Error("La réponse IA n'est pas un JSON valide.");
  }
}
