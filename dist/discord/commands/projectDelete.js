import { SlashCommandBuilder, } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { deleteProject } from "../../services/projectService.js";
export const projectDeleteCommand = {
    data: new SlashCommandBuilder()
        .setName("project-delete")
        .setDescription("Supprime un projet et ses données Project OS")
        .addStringOption((option) => option
        .setName("projet")
        .setDescription("Projet à supprimer")
        .setRequired(true)
        .setAutocomplete(true))
        .addStringOption((option) => option
        .setName("confirmation")
        .setDescription("Tape SUPPRIMER pour confirmer")
        .setRequired(true)),
    async execute(interaction) {
        const projectId = interaction.options.getString("projet", true);
        const confirmation = interaction.options
            .getString("confirmation", true)
            .trim()
            .toUpperCase();
        if (confirmation !== "SUPPRIMER") {
            await interaction.reply("Suppression annulée. Tape **SUPPRIMER** pour confirmer.");
            return;
        }
        const projects = await getProjects();
        const project = projects.find((item) => item.id === projectId);
        if (!project) {
            throw new Error("Projet introuvable.");
        }
        await deleteProject(projectId);
        await interaction.reply(`Projet supprimé : **${project.name}**. Le dépôt GitHub n'a pas été supprimé.`);
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
            console.error("Erreur autocomplete project-delete :", error);
            await interaction.respond([]);
        }
    },
};
