import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { createActivity } from "../../services/activityService.js";
import { getProjects, getProject, updateProject } from "../../services/projectService.js";

export const projectStatusCommand = {
  data: new SlashCommandBuilder()
    .setName("project-status")
    .setDescription("Modifie l'état d'un projet")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("etat")
        .setDescription("Nouvel état du projet")
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);
    const status = interaction.options.getString("etat", true);

    const previousProject = await getProject(projectId);

    const project = await updateProject(projectId, {
      current_state: status,
    });

    if (previousProject.current_state !== project.current_state) {
      await createActivity({
        project_id: project.id,
        type: "STATUS_CHANGED",
        source: "USER",
        title: `État changé : ${previousProject.current_state ?? "Non défini"} → ${project.current_state ?? "Non défini"}`,
        metadata: {
          previous_state: previousProject.current_state,
          current_state: project.current_state,
        },
      });
    }

    await interaction.reply(
      `État mis à jour : **${project.name}** → **${project.current_state}**`,
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
      console.error("Erreur autocomplete project-status :", error);

      await interaction.respond([]);
    }
  },
};
