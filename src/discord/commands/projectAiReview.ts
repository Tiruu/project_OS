import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { createActivity, getActivities } from "../../services/activityService.js";
import { getGithubRepositories } from "../../services/githubRepositoryService.js";
import { getProjects } from "../../services/projectService.js";
import { getGithubRepositoryContext } from "../../services/githubContextService.js";
import { reviewProjectWithAI } from "../../services/aiService.js";

const DISCORD_MAX_CONTENT_LENGTH = 2000;
const AI_REVIEW_MARKER = "​‌‍";
const AI_REVIEW_CHUNK_LENGTH =
  DISCORD_MAX_CONTENT_LENGTH - AI_REVIEW_MARKER.length;

function splitDiscordMessage(content: string): string[] {
  if (content.length <= AI_REVIEW_CHUNK_LENGTH) {
    return [AI_REVIEW_MARKER + content];
  }

  const chunks: string[] = [];
  let current = "";

  for (const line of content.split("\n")) {
    const candidate =
      current.length === 0
        ? line
        : current + "\n" + line;

    if (candidate.length <= AI_REVIEW_CHUNK_LENGTH) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(AI_REVIEW_MARKER + current);
    }

    if (line.length <= AI_REVIEW_CHUNK_LENGTH) {
      current = line;
      continue;
    }

    for (
      let offset = 0;
      offset < line.length;
      offset += AI_REVIEW_CHUNK_LENGTH
    ) {
      chunks.push(
        AI_REVIEW_MARKER +
          line.slice(
            offset,
            offset + AI_REVIEW_CHUNK_LENGTH,
          ),
      );
    }

    current = "";
  }

  if (current.length > 0) {
    chunks.push(AI_REVIEW_MARKER + current);
  }

  return chunks;
}

async function cleanupPreviousAiReviewMessages(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channel = interaction.channel;

  if (!channel || !("messages" in channel)) {
    return;
  }

  const botId = interaction.client.user?.id;

  if (!botId) {
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 });

  const previousMessages = messages.filter(
    (message) =>
      message.author.id === botId &&
      message.content.includes(AI_REVIEW_MARKER),
  );

  await Promise.all(
    previousMessages.map(async (message) => {
      try {
        await message.delete();
      } catch (error) {
        console.warn(
          "Impossible de supprimer une ancienne analyse IA :",
          error,
        );
      }
    }),
  );
}

export const projectAiReviewCommand = {
  data: new SlashCommandBuilder()
    .setName("project-ai-review")
    .setDescription("Analyse un projet avec l'IA")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet à analyser")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);

    await interaction.deferReply();

    try {
      const projects = await getProjects();
      const project = projects.find((item) => item.id === projectId);

      if (!project) {
        throw new Error("Projet introuvable.");
      }

      const repositories = await getGithubRepositories(project.id);

      if (repositories.length === 0) {
        throw new Error(
          "Ce projet n'a aucun dépôt GitHub connecté.",
        );
      }

      const repository = repositories[0];

      const [context, activities] = await Promise.all([
        getGithubRepositoryContext(
          repository.owner,
          repository.repository,
        ),
        getActivities(project.id),
      ]);

      context.project = {
        name: project.name,
        type: project.type,
        technologies: project.technologies,
        description: project.description,
        current_state: project.current_state,
      };

      context.recent_activity = activities
        .filter((activity) => activity.source === "GITHUB")
        .slice(0, 10)
        .map((activity) =>
          activity.description
            ? activity.title + " — " + activity.description
            : activity.title,
        );

      const review = await reviewProjectWithAI(context);

      await createActivity({
        project_id: project.id,
        type: "AI_REVIEW",
        source: "BOT",
        title: "Analyse IA : " + project.name,
        description: review.summary,
        metadata: {
          summary: review.summary,
          purpose: review.purpose,
          type: review.type,
          technologies: review.technologies,
          inferred_state: review.inferred_state,
          state_evidence: review.state_evidence,
          observed_features: review.observed_features,
          confidence: review.confidence,
          uncertainties: review.uncertainties,
          suggested_tasks: review.suggested_tasks,
        },
      });

      await cleanupPreviousAiReviewMessages(interaction);

      const lines = [
        "**Analyse IA : " + project.name + "**",
        "",
        "**Résumé**",
        review.summary,
        "",
        "**But probable**",
        review.purpose,
        "",
        "**Type**",
        review.type,
        "",
        "**Technologies**",
        review.technologies.join(", ") || "Aucune",
        "",
        "**État réel estimé**",
        review.inferred_state,
        ...(review.state_evidence.length > 0
          ? [
              "",
              "**Preuves de l'état**",
              ...review.state_evidence
                .slice(0, 5)
                .map(
                  (item) =>
                    "• [" +
                    item.kind +
                    "] " +
                    item.source +
                    " — " +
                    item.claim,
                ),
            ]
          : []),
        "",
        "**Fonctionnalités / sous-systèmes observés**",
        ...(review.observed_features.length > 0
          ? review.observed_features.slice(0, 8).map(
              (feature) =>
                "• **" +
                feature.name +
                "** — " +
                feature.description +
                (feature.evidence.length > 0
                  ? " [" +
                    feature.evidence
                      .slice(0, 2)
                      .map(
                        (item) =>
                          item.kind +
                          ": " +
                          item.source,
                      )
                      .join(" | ") +
                    "]"
                  : ""),
            )
          : ["Aucun identifié avec suffisamment de preuves."]),
        "",
        "**Confiance globale**",
        Math.round(review.confidence * 100) + "%",
        "",
        "**Incertitudes**",
        ...(review.uncertainties.length > 0
          ? review.uncertainties.map((item) => "• " + item)
          : ["Aucune"]),
        "",
        "**Tâches proposées**",
        ...(review.suggested_tasks.length > 0
          ? review.suggested_tasks.map(
              (task) =>
                "• **" +
                task.title +
                "** [" +
                task.task_kind +
                "] — priorité " +
                task.priority +
                " — " +
                task.problem +
                " — " +
                task.reason +
                " [preuve: " +
                (task.evidence.length > 0
                  ? task.evidence
                      .slice(0, 2)
                      .map(
                        (item) =>
                          item.kind +
                          ": " +
                          item.source +
                          " — " +
                          item.claim,
                      )
                      .join(" | ")
                  : "non précisée") +
                " | confiance: " +
                Math.round(task.confidence * 100) +
                "%]",
            )
          : [
              "Aucune tâche : aucune action suffisamment justifiée n'a été identifiée.",
            ]),
        "",
        "Aucune tâche n'a été créée automatiquement.",
      ];

      const chunks = splitDiscordMessage(lines.join("\n"));

      await interaction.editReply(chunks[0]);

      for (const chunk of chunks.slice(1)) {
        await interaction.followUp(chunk);
      }
    } catch (error) {
      console.error("Erreur analyse IA :", error);

      const message =
        error instanceof Error
          ? "Analyse IA impossible : " + error.message
          : "Analyse IA impossible.";

      const chunks = splitDiscordMessage(message);

      await interaction.editReply(chunks[0]);

      for (const chunk of chunks.slice(1)) {
        await interaction.followUp(chunk);
      }
    }
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const projects = await getProjects();

      const choices = projects
        .filter((project) =>
          project.name.toLowerCase().includes(focusedValue),
        )
        .slice(0, 25)
        .map((project) => ({
          name: project.name,
          value: project.id,
        }));

      await interaction.respond(choices);
    } catch (error) {
      console.error("Erreur autocomplete project-ai-review :", error);
      await interaction.respond([]);
    }
  },
};
