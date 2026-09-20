import { SlashCommandBuilder, } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { getProjectDashboard } from "../../services/projectDashboardService.js";
function formatActivityDate(occurredAt) {
    if (typeof occurredAt !== "string") {
        return "";
    }
    const date = new Date(occurredAt);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return ` — ${date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })}`;
}
export const projectShowCommand = {
    data: new SlashCommandBuilder()
        .setName("project-show")
        .setDescription("Affiche le dashboard d'un projet")
        .addStringOption((option) => option
        .setName("projet")
        .setDescription("Projet à afficher")
        .setRequired(true)
        .setAutocomplete(true)),
    async execute(interaction) {
        const projectId = interaction.options.getString("projet", true);
        const dashboard = await getProjectDashboard(projectId);
        const lines = [
            `# ${dashboard.project.name}`,
            "",
            "**État**",
            dashboard.project.current_state ?? "Non défini",
            "",
            "**Type**",
            dashboard.project.type,
            "",
            "**Technologies**",
            dashboard.project.technologies.length > 0
                ? dashboard.project.technologies.join(", ")
                : "Aucune",
            "",
            "**Description**",
            dashboard.project.description ?? "Aucune",
            "",
            "**GitHub**",
            ...(dashboard.githubRepositories.length > 0
                ? dashboard.githubRepositories.map((repository) => `• ${repository.owner}/${repository.repository} — ${repository.url}`)
                : ["Aucun dépôt connecté"]),
            "",
            "**Tâches**",
            `Terminées : ${dashboard.doneTasks.length}`,
            `En cours : ${dashboard.inProgressTasks.length}`,
            `À faire : ${dashboard.todoTasks.length}`,
            "",
            "**Prochaines tâches**",
            ...(dashboard.todoTasks.length > 0
                ? dashboard.todoTasks
                    .slice(0, 5)
                    .map((task) => `• ${task.title} — priorité ${task.priority}`)
                : ["Aucune"]),
            "",
            "**Décisions actives**",
            ...(dashboard.activeDecisions.length > 0
                ? dashboard.activeDecisions
                    .slice(0, 5)
                    .map((decision) => `• ${decision.title}`)
                : ["Aucune"]),
            "",
            "**Activité récente**",
            ...(dashboard.recentActivities.length > 0
                ? dashboard.recentActivities
                    .slice(0, 5)
                    .map((activity) => `• ${activity.title}${formatActivityDate(activity.metadata.occurred_at)}`)
                : ["Aucune"]),
        ];
        await interaction.reply(lines.join("\n"));
    },
    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const projects = await getProjects();
            const choices = projects
                .filter((project) => project.name.toLowerCase().includes(focusedValue))
                .slice(0, 25)
                .map((project) => ({
                name: project.name,
                value: project.id,
            }));
            await interaction.respond(choices);
        }
        catch (error) {
            console.error("Erreur autocomplete project-show :", error);
            await interaction.respond([]);
        }
    },
};
