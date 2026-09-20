import { SlashCommandBuilder, } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { getTasks, startTask } from "../../services/taskService.js";
export const projectNextCommand = {
    data: new SlashCommandBuilder()
        .setName("project-next")
        .setDescription("Démarre automatiquement la prochaine tâche")
        .addStringOption((option) => option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true)),
    async execute(interaction) {
        const projectId = interaction.options.getString("projet", true);
        const tasks = await getTasks(projectId);
        const nextTask = tasks.find((task) => task.status === "TODO");
        if (!nextTask) {
            await interaction.reply("Aucune tâche TODO disponible.");
            return;
        }
        const startedTask = await startTask(nextTask.id);
        await interaction.reply(`Prochaine tâche lancée : **${startedTask.title}**`);
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
            console.error("Erreur autocomplete project-next :", error);
            await interaction.respond([]);
        }
    },
};
