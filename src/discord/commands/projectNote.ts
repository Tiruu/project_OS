import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { createActivity } from "../../services/activityService.js";
import { getProjects } from "../../services/projectService.js";

export const projectNoteCommand = {
  data: new SlashCommandBuilder()
    .setName("project-note")
    .setDescription("Ajoute une note à un projet")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("note")
        .setDescription("Note à conserver")
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);
    const note = interaction.options.getString("note", true);

    await createActivity({
      project_id: projectId,
      type: "NOTE_ADDED",
      source: "USER",
      title: "Note ajoutée",
      description: note,
      metadata: {
        author: interaction.user.id,
      },
    });

    await interaction.reply("Note enregistrée.");
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
      console.error("Erreur autocomplete project-note :", error);
      await interaction.respond([]);
    }
  },
};
