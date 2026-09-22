import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { getProjects } from "../../services/projectService.js";
import { deleteTask, getTasks } from "../../services/taskService.js";

export const projectTaskDeleteCommand = {
  data: new SlashCommandBuilder()
    .setName("project-task-delete")
    .setDescription("Supprime une tâche Project OS")
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
        .setDescription("Tâche à supprimer")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("confirmation")
        .setDescription("Tape SUPPRIMER pour confirmer")
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);
    const taskId = interaction.options.getString("tache", true);
    const confirmation = interaction.options
      .getString("confirmation", true)
      .trim()
      .toUpperCase();

    if (confirmation !== "SUPPRIMER") {
      await interaction.reply(
        "Suppression annulée. Tape **SUPPRIMER** pour confirmer.",
      );
      return;
    }

    const tasks = await getTasks(projectId);
    const task = tasks.find((item) => item.id === taskId);

    if (!task) {
      await interaction.reply(
        "Tâche introuvable dans ce projet. Sélectionne une tâche proposée par l'autocomplete.",
      );
      return;
    }

    const deletedTask = await deleteTask(task.id);

    await interaction.reply(
      `Tâche supprimée dans le projet : **${deletedTask.title}**`,
    );
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const focused = interaction.options.getFocused(true);

      if (focused.name === "projet") {
        const projects = await getProjects();

        const choices = projects
          .filter((project) =>
            project.name.toLowerCase().includes(focused.value.toLowerCase()),
          )
          .slice(0, 25)
          .map((project) => ({
            name:
              project.name.length > 100
                ? project.name.slice(0, 97) + "..."
                : project.name,
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
          .filter((task) =>
            task.title.toLowerCase().includes(focused.value.toLowerCase()),
          )
          .slice(0, 25)
          .map((task) => ({
            name:
              task.title.length > 100
                ? task.title.slice(0, 97) + "..."
                : task.title,
            value: task.id,
          }));

        await interaction.respond(choices);
        return;
      }

      await interaction.respond([]);
    } catch (error) {
      console.error("Erreur autocomplete project-task-delete :", error);
      await interaction.respond([]);
    }
  },
};
