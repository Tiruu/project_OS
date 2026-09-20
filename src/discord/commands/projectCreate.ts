import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

import { createProject } from "../../services/projectService.js";

export const projectCreateCommand = {
  data: new SlashCommandBuilder()
    .setName("project-create")
    .setDescription("Crée un nouveau projet")
    .addStringOption((option) =>
      option.setName("nom").setDescription("Nom du projet").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("type").setDescription("Type de projet").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("technologies")
        .setDescription("Technologies utilisées, séparées par des virgules")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Description du projet")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("etat")
        .setDescription("État actuel du projet")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const name = interaction.options.getString("nom", true);
    const type = interaction.options.getString("type", true);
    const technologiesInput = interaction.options.getString(
      "technologies",
      true,
    );
    const description =
      interaction.options.getString("description") ?? undefined;
    const currentState = interaction.options.getString("etat") ?? undefined;

    const technologies = technologiesInput
      .split(",")
      .map((technology) => technology.trim())
      .filter(Boolean);

    const project = await createProject({
      name,
      type,
      technologies,
      description,
      current_state: currentState,
    });

    await interaction.reply(`Projet créé : **${project.name}**`);
  },
};
