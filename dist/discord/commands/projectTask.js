import { SlashCommandBuilder, } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { createTask } from "../../services/taskService.js";
export const projectTaskCommand = {
    data: new SlashCommandBuilder()
        .setName("project-task")
        .setDescription("Crée une tâche dans un projet")
        .addStringOption((option) => option
        .setName("projet")
        .setDescription("Projet concerné")
        .setRequired(true)
        .setAutocomplete(true))
        .addStringOption((option) => option
        .setName("titre")
        .setDescription("Titre de la tâche")
        .setRequired(true))
        .addIntegerOption((option) => option
        .setName("priorite")
        .setDescription("Priorité de la tâche")
        .setMinValue(1)
        .setRequired(false)),
    async execute(interaction) {
        const projectId = interaction.options.getString("projet", true);
        const title = interaction.options.getString("titre", true);
        const priority = interaction.options.getInteger("priorite") ?? 1;
        const task = await createTask({
            project_id: projectId,
            title,
            priority,
        });
        await interaction.reply(`Tâche créée : **${task.title}** (priorité ${task.priority})`);
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
            console.error("Erreur autocomplete project-task :", error);
            await interaction.respond([]);
        }
    },
};
