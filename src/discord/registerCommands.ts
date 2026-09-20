import "dotenv/config";

import { REST, Routes } from "discord.js";

import { projectShowCommand } from "./commands/projectShow.js";
import { projectTaskCommand } from "./commands/projectTask.js";
import { projectDoneCommand } from "./commands/projectDone.js";
import { projectCreateCommand } from "./commands/projectCreate.js";
import { projectStatusCommand } from "./commands/projectStatus.js";
import { projectDecisionCommand } from "./commands/projectDecision.js";
import { projectNoteCommand } from "./commands/projectNote.js";
import { projectStartCommand } from "./commands/projectStart.js";
import { projectNextCommand } from "./commands/projectNext.js";
import { projectGithubCommand } from "./commands/projectGithub.js";
import { projectGithubSyncCommand } from "./commands/projectGithubSync.js";
import { projectImportGithubCommand } from "./commands/projectImportGithub.js";
import { projectDeleteCommand } from "./commands/projectDelete.js";
import { projectTaskDeleteCommand } from "./commands/projectTaskDelete.js";
import { projectDiscoverCommand } from "./commands/projectDiscover.js";
import { projectAiReviewCommand } from "./commands/projectAiReview.js";

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
    projectStatusCommand.data.toJSON(),
    projectDecisionCommand.data.toJSON(),
    projectNoteCommand.data.toJSON(),
    projectStartCommand.data.toJSON(),
    projectNextCommand.data.toJSON(),
    projectGithubCommand.data.toJSON(),
    projectGithubSyncCommand.data.toJSON(),
    projectImportGithubCommand.data.toJSON(),
    projectDeleteCommand.data.toJSON(),
    projectTaskDeleteCommand.data.toJSON(),
    projectDiscoverCommand.data.toJSON(),
    projectAiReviewCommand.data.toJSON(),
  ],
});

console.log("Commandes Discord enregistrées.");
