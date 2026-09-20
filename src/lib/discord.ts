import "dotenv/config";

import { Client, GatewayIntentBits } from "discord.js";

const discordToken = process.env.DISCORD_TOKEN;

if (!discordToken) {
  throw new Error("DISCORD_TOKEN manquant dans .env");
}

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds],
});

export async function startDiscord(): Promise<void> {
  discordClient.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
      try {
        if (interaction.commandName === "project-show") {
          const { projectShowCommand } =
            await import("../discord/commands/projectShow.js");

          await projectShowCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-task") {
          const { projectTaskCommand } =
            await import("../discord/commands/projectTask.js");

          await projectTaskCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-done") {
          const { projectDoneCommand } =
            await import("../discord/commands/projectDone.js");

          await projectDoneCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-status") {
          const { projectStatusCommand } =
            await import("../discord/commands/projectStatus.js");

          await projectStatusCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-decision") {
          const { projectDecisionCommand } =
            await import("../discord/commands/projectDecision.js");

          await projectDecisionCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-note") {
          const { projectNoteCommand } =
            await import("../discord/commands/projectNote.js");

          await projectNoteCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-start") {
          const { projectStartCommand } =
            await import("../discord/commands/projectStart.js");

          await projectStartCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-next") {
          const { projectNextCommand } =
            await import("../discord/commands/projectNext.js");

          await projectNextCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-github") {
          const { projectGithubCommand } =
            await import("../discord/commands/projectGithub.js");

          await projectGithubCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-github-sync") {
          const { projectGithubSyncCommand } =
            await import("../discord/commands/projectGithubSync.js");

          await projectGithubSyncCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-import-github") {
          const { projectImportGithubCommand } =
            await import("../discord/commands/projectImportGithub.js");

          await projectImportGithubCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-delete") {
          const { projectDeleteCommand } =
            await import("../discord/commands/projectDelete.js");

          await projectDeleteCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-task-delete") {
          const { projectTaskDeleteCommand } =
            await import("../discord/commands/projectTaskDelete.js");

          await projectTaskDeleteCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-brief") {
          const { projectBriefCommand } = await import("../discord/commands/projectBrief.js");
          await projectBriefCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-decision-list") {
          const { projectDecisionListCommand } = await import("../discord/commands/projectDecisionList.js");
          await projectDecisionListCommand.autocomplete(interaction);
          return;
        }

        if (interaction.commandName === "project-decision-update") {
          const { projectDecisionUpdateCommand } = await import("../discord/commands/projectDecisionUpdate.js");
          await projectDecisionUpdateCommand.autocomplete(interaction);
          return;
        }

      if (interaction.commandName === "project-ai-review") {
          const { projectAiReviewCommand } =
            await import("../discord/commands/projectAiReview.js");

          await projectAiReviewCommand.autocomplete(interaction);
          return;
        }

        await interaction.respond([]);
      } catch (error) {
        console.error(
          `Erreur autocomplete /${interaction.commandName} :`,
          error,
        );

        await interaction.respond([]);
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("ai-task:")) {
        try {
          const { handleAiTaskAction } =
            await import("../discord/commands/projectAiReview.js");

          await handleAiTaskAction(interaction);
        } catch (error) {
          console.error("Erreur bouton tâche IA :", error);

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: "Une erreur est survenue pendant le traitement de la tâche IA.",
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: "Une erreur est survenue pendant le traitement de la tâche IA.",
              ephemeral: true,
            });
          }
        }

        return;
      }

      if (interaction.customId.startsWith("github-import:")) {
        try {
          const { projectDiscoverCommand } =
            await import("../discord/commands/projectDiscover.js");

          await projectDiscoverCommand.handleImport(interaction);
        } catch (error) {
          console.error("Erreur bouton import GitHub :", error);

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(
              "Une erreur est survenue pendant l'import GitHub.",
            );
          } else {
            await interaction.reply({
              content: "Une erreur est survenue pendant l'import GitHub.",
              ephemeral: true,
            });
          }
        }
      }

      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    console.log(`Interaction reçue : ${interaction.commandName}`);

    try {
      if (interaction.commandName === "project-create") {
        const { projectCreateCommand } =
          await import("../discord/commands/projectCreate.js");

        await projectCreateCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-show") {
        const { projectShowCommand } =
          await import("../discord/commands/projectShow.js");

        await projectShowCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-task") {
        const { projectTaskCommand } =
          await import("../discord/commands/projectTask.js");

        await projectTaskCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-done") {
        const { projectDoneCommand } =
          await import("../discord/commands/projectDone.js");

        await projectDoneCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-status") {
        const { projectStatusCommand } =
          await import("../discord/commands/projectStatus.js");

        await projectStatusCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-decision") {
        const { projectDecisionCommand } =
          await import("../discord/commands/projectDecision.js");

        await projectDecisionCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-note") {
        const { projectNoteCommand } =
          await import("../discord/commands/projectNote.js");

        await projectNoteCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-start") {
        const { projectStartCommand } =
          await import("../discord/commands/projectStart.js");

        await projectStartCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-next") {
        const { projectNextCommand } =
          await import("../discord/commands/projectNext.js");

        await projectNextCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-github") {
        const { projectGithubCommand } =
          await import("../discord/commands/projectGithub.js");

        await projectGithubCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-github-sync") {
        const { projectGithubSyncCommand } =
          await import("../discord/commands/projectGithubSync.js");

        await projectGithubSyncCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-import-github") {
        const { projectImportGithubCommand } =
          await import("../discord/commands/projectImportGithub.js");

        await projectImportGithubCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-delete") {
        const { projectDeleteCommand } =
          await import("../discord/commands/projectDelete.js");

        await projectDeleteCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-task-delete") {
        const { projectTaskDeleteCommand } =
          await import("../discord/commands/projectTaskDelete.js");

        await projectTaskDeleteCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-discover") {
        const { projectDiscoverCommand } =
          await import("../discord/commands/projectDiscover.js");

        await projectDiscoverCommand.execute(interaction);
        return;
      }

      if (interaction.commandName === "project-ai-review") {
        const { projectAiReviewCommand } =
          await import("../discord/commands/projectAiReview.js");

        await projectAiReviewCommand.execute(interaction);
        return;
      }
    } catch (error) {
      console.error(
        `Erreur pendant l'exécution de /${interaction.commandName} :`,
        error,
      );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(
          "Une erreur est survenue pendant l'exécution de la commande.",
        );
      } else {
        await interaction.reply(
          "Une erreur est survenue pendant l'exécution de la commande.",
        );
      }
    }
  });

  await discordClient.login(discordToken);
}
