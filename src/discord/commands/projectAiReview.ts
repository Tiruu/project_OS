import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { getGithubRepositories } from "../../services/githubRepositoryService.js";
import { getProjects } from "../../services/projectService.js";
import { getGithubRepositoryContext } from "../../services/githubContextService.js";
import { reviewProjectWithAI } from "../../services/aiService.js";

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

    const project = await (async () => {
      const projects = await getProjects();
      const found = projects.find((item) => item.id === projectId);

      if (!found) {
        throw new Error("Projet introuvable.");
      }

      return found;
    })();

    const repositories = await getGithubRepositories(project.id);

    if (repositories.length === 0) {
      throw new Error(
        "Ce projet n'a aucun dépôt GitHub connecté.",
      );
    }

    const repository = repositories[0];
    const context = await getGithubRepositoryContext(
      repository.owner,
      repository.repository,
    );

    const review = await reviewProjectWithAI(context);

    const lines = [
      `**Analyse IA : ${project.name}**`,
      "",
      `**Résumé**`,
      review.summary,
      "",
      `**But probable**`,
      review.purpose,
      "",
      `**Type**`,
      review.type,
      "",
      `**Technologies**`,
      review.technologies.join(", ") || "Aucune",
      "",
      `**État estimé**`,
      review.current_state,
      "",
      `**Confiance**`,
      `${Math.round(review.confidence * 100)}%`,
      "",
      `**Incertitudes**`,
      ...(review.uncertainties.length > 0
        ? review.uncertainties.map((item) => `• ${item}`)
        : ["Aucune"]),
      "",
      `**Tâches proposées**`,
      ...(review.suggested_tasks.length > 0
        ? review.suggested_tasks.map(
            (task) =>
              `• ${task.title} — priorité ${task.priority} — ${task.reason}`,
          )
        : ["Aucune"]),
    ];

    await interaction.editReply(lines.join("\n"));
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
