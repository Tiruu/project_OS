import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { getTasks } from "../../services/taskService.js";
import { completeTask } from "../../services/taskService.js";

export const projectDoneCommand = {
  data: new SlashCommandBuilder()
    .setName("project-done")
    .setDescription("Termine une tâche")
    .addStringOption((option) =>
      option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("tache")
        .setDescription("Tâche à terminer")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const taskId = interaction.options.getString("tache", true);

    const task = await completeTask(taskId);

    await interaction.reply(
      `Tâche terminée dans le projet : **${task.title}**`,
    );
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const focused = interaction.options.getFocused(true);

      if (focused.name === "projet") {
        const { getProjects } =
          await import("../../services/projectService.js");

        const projects = await getProjects();

        const choices = projects
          .filter((project) =>
            project.name.toLowerCase().includes(focused.value.toLowerCase()),
          )
          .slice(0, 25)
          .map((project) => ({
            name: project.name,
            value: project.id,
          }));

        await interaction.respond(choices);
        return;
      }

      if (focused.name === "tache") {
        const projectId = interaction.options.getString("projet");

        if (!projectId) {
          await interaction.respond([]);
          return;
        }

        const tasks = await getTasks(projectId);

        const choices = tasks
          .filter((task) => task.status !== "DONE")
          .filter((task) =>
            task.title.toLowerCase().includes(focused.value.toLowerCase()),
          )
          .slice(0, 25)
          .map((task) => ({
            name: task.title,
            value: task.id,
          }));

        await interaction.respond(choices);
        return;
      }

      await interaction.respond([]);
    } catch (error) {
      console.error("Erreur autocomplete project-done :", error);

      await interaction.respond([]);
    }
  },
};
