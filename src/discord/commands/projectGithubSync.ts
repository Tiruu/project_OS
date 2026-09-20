import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { syncGithubProject } from "../../services/githubService.js";
import { getProjects } from "../../services/projectService.js";

export const projectGithubSyncCommand = {
  data: new SlashCommandBuilder()
    .setName("project-github-sync")
    .setDescription("Synchronise les activités GitHub d'un projet")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);

    const created = await syncGithubProject(projectId);

    await interaction.reply(
      created === 0
        ? "GitHub est déjà à jour pour ce projet."
        : `Synchronisation terminée : **${created}** nouvelle(s) activité(s).`,
    );
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
      console.error("Erreur autocomplete project-github-sync :", error);
      await interaction.respond([]);
    }
  },
};
