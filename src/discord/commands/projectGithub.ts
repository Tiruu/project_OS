import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { connectGithubRepository } from "../../services/githubRepositoryService.js";
import { getProjects } from "../../services/projectService.js";

export const projectGithubCommand = {
  data: new SlashCommandBuilder()
    .setName("project-github")
    .setDescription("Connecte un dépôt GitHub à un projet")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("proprietaire")
        .setDescription("Propriétaire GitHub, ex: Tiruu")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("depot")
        .setDescription("Nom du dépôt, ex: project_OS")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("branche")
        .setDescription("Branche principale")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);
    const owner = interaction.options.getString("proprietaire", true);
    const repository = interaction.options.getString("depot", true);
    const defaultBranch =
      interaction.options.getString("branche") ?? "main";

    const connected = await connectGithubRepository({
      project_id: projectId,
      owner,
      repository,
      url: `https://github.com/${owner}/${repository}`,
      default_branch: defaultBranch,
    });

    await interaction.reply(
      `Dépôt GitHub connecté : **${connected.owner}/${connected.repository}**`,
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
      console.error("Erreur autocomplete project-github :", error);
      await interaction.respond([]);
    }
  },
};
