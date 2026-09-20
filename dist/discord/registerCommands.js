import "dotenv/config";
import { REST, Routes } from "discord.js";
import { projectShowCommand } from "./commands/projectShow.js";
import { projectTaskCommand } from "./commands/projectTask.js";
import { projectDoneCommand } from "./commands/projectDone.js";
import { projectCreateCommand } from "./commands/projectCreate.js";
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token) {
    throw new Error("DISCORD_TOKEN manquant dans .env");
}
if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID manquant dans .env");
}
if (!guildId) {
    throw new Error("DISCORD_GUILD_ID manquant dans .env");
}
const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [
        projectShowCommand.data.toJSON(),
        projectTaskCommand.data.toJSON(),
        projectDoneCommand.data.toJSON(),
        projectCreateCommand.data.toJSON(),
    ],
});
console.log("Commandes Discord enregistrées.");
