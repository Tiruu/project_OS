import { SlashCommandBuilder, } from "discord.js";
import { importGithubProject } from "../../services/githubImportService.js";
async function searchGithubRepositories(query) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Project-OS",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=25`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
        return { items: [] };
    }
    return (await response.json());
}
export const projectImportGithubCommand = {
    data: new SlashCommandBuilder()
        .setName("project-import-github")
        .setDescription("Crée un projet directement depuis un dépôt GitHub")
        .addStringOption((option) => option
        .setName("proprietaire")
        .setDescription("Propriétaire GitHub, ex: Tiruu")
        .setRequired(true))
        .addStringOption((option) => option
        .setName("depot")
        .setDescription("Dépôt GitHub à importer")
        .setRequired(true)
        .setAutocomplete(true)),
    async execute(interaction) {
        const owner = interaction.options.getString("proprietaire", true);
        const repository = interaction.options.getString("depot", true);
        await interaction.deferReply();
        const result = await importGithubProject(owner, repository);
        const action = result.created ? "Projet créé" : "Projet déjà existant";
        await interaction.editReply([
            `**${action} : ${result.projectName}**`,
            `GitHub : ${result.analysis.owner}/${result.analysis.repository}`,
            `Type : ${result.analysis.type}`,
            `Technologies : ${result.analysis.technologies.join(", ") || "Aucune détectée"}`,
            `Description : ${result.analysis.description ?? "Aucune"}`,
            `Activités synchronisées : ${result.syncedActivities}`,
        ].join("\n"));
    },
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "depot") {
            await interaction.respond([]);
            return;
        }
        const owner = interaction.options.getString("proprietaire");
        if (!owner) {
            await interaction.respond([]);
            return;
        }
        const search = focused.value.trim();
        try {
            const result = await searchGithubRepositories(`user:${owner} ${search}`.trim());
            const choices = result.items
                .filter((repository) => repository.owner.login.toLowerCase() === owner.toLowerCase())
                .slice(0, 25)
                .map((repository) => ({
                name: repository.full_name,
                value: repository.name,
            }));
            await interaction.respond(choices);
        }
        catch (error) {
            console.error("Erreur autocomplete project-import-github :", error);
            await interaction.respond([]);
        }
    },
};
