import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { getProjects } from "../../services/projectService.js";
import { createDecision } from "../../services/decisionService.js";

export const projectDecisionCommand = {
  data: new SlashCommandBuilder()
    .setName("project-decision")
    .setDescription("Enregistre une décision de projet")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("titre")
        .setDescription("Titre de la décision")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("decision")
        .setDescription("Décision prise")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Pourquoi cette décision ?")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("consequences")
        .setDescription("Conséquences attendues")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);
    const title = interaction.options.getString("titre", true);
    const decision = interaction.options.getString("decision", true);
    const reason = interaction.options.getString("raison") ?? undefined;
    const consequences =
      interaction.options.getString("consequences") ?? undefined;

    const created = await createDecision({
      project_id: projectId,
      title,
      decision,
      reason,
      consequences,
    });

    await interaction.reply(
      `Décision enregistrée : **${created.title}**`,
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
      console.error("Erreur autocomplete project-decision :", error);
      await interaction.respond([]);
    }
  },
};
