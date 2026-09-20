import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
const discordToken = process.env.DISCORD_TOKEN;
if (!discordToken) {
    throw new Error("DISCORD_TOKEN manquant dans .env");
}
export const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds],
});
export async function startDiscord() {
    discordClient.on("interactionCreate", async (interaction) => {
        if (interaction.isAutocomplete()) {
            try {
                if (interaction.commandName === "project-show") {
                    const { projectShowCommand } = await import("../discord/commands/projectShow.js");
                    await projectShowCommand.autocomplete(interaction);
                    return;
                }
                if (interaction.commandName === "project-task") {
                    const { projectTaskCommand } = await import("../discord/commands/projectTask.js");
                    await projectTaskCommand.autocomplete(interaction);
                    return;
                }
                if (interaction.commandName === "project-done") {
                    const { projectDoneCommand } = await import("../discord/commands/projectDone.js");
                    await projectDoneCommand.autocomplete(interaction);
                    return;
                }
                await interaction.respond([]);
            }
            catch (error) {
                console.error(`Erreur autocomplete /${interaction.commandName} :`, error);
                await interaction.respond([]);
            }
            return;
        }
        if (!interaction.isChatInputCommand()) {
            return;
        }
        console.log(`Interaction reçue : ${interaction.commandName}`);
        try {
            if (interaction.commandName === "project-create") {
                const { projectCreateCommand } = await import("../discord/commands/projectCreate.js");
                await projectCreateCommand.execute(interaction);
                return;
            }
            if (interaction.commandName === "project-show") {
                const { projectShowCommand } = await import("../discord/commands/projectShow.js");
                await projectShowCommand.execute(interaction);
                return;
            }
            if (interaction.commandName === "project-task") {
                const { projectTaskCommand } = await import("../discord/commands/projectTask.js");
                await projectTaskCommand.execute(interaction);
                return;
            }
            if (interaction.commandName === "project-done") {
                const { projectDoneCommand } = await import("../discord/commands/projectDone.js");
                await projectDoneCommand.execute(interaction);
                return;
            }
        }
        catch (error) {
            console.error(`Erreur pendant l'exécution de /${interaction.commandName} :`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp("Une erreur est survenue pendant l'exécution de la commande.");
            }
            else {
                await interaction.reply("Une erreur est survenue pendant l'exécution de la commande.");
            }
        }
    });
    await discordClient.login(discordToken);
}
