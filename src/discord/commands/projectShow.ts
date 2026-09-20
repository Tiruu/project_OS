import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

import { getProjectDashboard } from "../../services/projectDashboardService.js";

const projectId = "62032ca3-4d5a-47fc-9303-985f122e5629";

export const projectShowCommand = {
  data: new SlashCommandBuilder()
    .setName("project-show")
    .setDescription("Affiche le dashboard d'un projet"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const dashboard = await getProjectDashboard(projectId);

    const todo = dashboard.tasks.filter(
      (task) => task.status === "TODO",
    ).length;

    const inProgress = dashboard.tasks.filter(
      (task) => task.status === "IN_PROGRESS",
    ).length;

    const done = dashboard.tasks.filter(
      (task) => task.status === "DONE",
    ).length;

    const lines = [
      `## ${dashboard.project.name}`,
      "",
      `**État**`,
      dashboard.project.current_state ?? "Non défini",
      "",
      `**Tâches**`,
      `DONE : ${done}`,
      `IN PROGRESS : ${inProgress}`,
      `TODO : ${todo}`,
      "",
      `**Décisions actives**`,
      ...(dashboard.activeDecisions.length > 0
        ? dashboard.activeDecisions.map((decision) => `• ${decision.title}`)
        : ["Aucune"]),
      "",
      `**Activité récente**`,
      ...dashboard.recentActivities
        .slice(0, 5)
        .map((activity) => `• ${activity.title}`),
    ];

    await interaction.reply(lines.join("\n"));
  },
};
