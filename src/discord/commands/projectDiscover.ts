import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { importGithubProject } from "../../services/githubImportService.js";
import { discoverGithubRepositories } from "../../services/githubDiscoveryService.js";

function buildComponents(
  repositories: Awaited<ReturnType<typeof discoverGithubRepositories>>,
) {
  const available = repositories.filter(
    (repository) => !repository.alreadyImported,
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let index = 0; index < Math.min(available.length, 25); index += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (const repository of available.slice(index, index + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(
            `github-import:${repository.owner}/${repository.name}`,
          )
          .setLabel(
            `Importer ${repository.name}`.slice(0, 80),
          )
          .setStyle(ButtonStyle.Primary),
      );
    }

    rows.push(row);
  }

  return rows;
}

function buildMessage(
  owner: string,
  repositories: Awaited<ReturnType<typeof discoverGithubRepositories>>,
): string {
  const available = repositories.filter(
    (repository) => !repository.alreadyImported,
  );

  const imported = repositories.filter(
    (repository) => repository.alreadyImported,
  );

  const lines = [
    `**Dépôts GitHub de ${owner}**`,
    "",
    `Disponibles pour import : **${available.length}**`,
    ...available.slice(0, 25).map((repository) => {
      const details = [
        repository.visibility,
        repository.language ?? "langage inconnu",
      ].join(" · ");

      return `• **${repository.full_name}** — ${details}${repository.description ? ` — ${repository.description}` : ""}`;
    }),
    "",
    `Déjà importés : **${imported.length}**`,
    ...(imported.length > 0
      ? imported
          .slice(0, 10)
          .map((repository) => `• ${repository.full_name}`)
      : ["Aucun"]),
  ];

  if (available.length > 25) {
    lines.push(
      "",
      `... et ${available.length - 25} autre(s) dépôt(s).`,
    );
  }

  return lines.join("\n");
}

export const projectDiscoverCommand = {
  data: new SlashCommandBuilder()
    .setName("project-discover")
    .setDescription("Découvre les dépôts GitHub disponibles")
    .addStringOption((option) =>
      option
        .setName("proprietaire")
        .setDescription("Compte GitHub à explorer")
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const owner = interaction.options.getString("proprietaire", true);

    await interaction.deferReply();

    const repositories = await discoverGithubRepositories(owner);

    if (repositories.length === 0) {
      await interaction.editReply(
        `Aucun dépôt trouvé pour **${owner}**.`,
      );
      return;
    }

    await interaction.editReply({
      content: buildMessage(owner, repositories),
      components: buildComponents(repositories),
    });
  },

  async handleImport(interaction: ButtonInteraction): Promise<void> {
    const match = interaction.customId.match(
      /^github-import:([^/]+)\/(.+)$/,
    );

    if (!match) {
      await interaction.reply({
        content: "Identifiant d'import GitHub invalide.",
        ephemeral: true,
      });
      return;
    }

    const [, owner, repository] = match;

    await interaction.deferUpdate();

    try {
      const result = await importGithubProject(owner, repository);
      const repositories = await discoverGithubRepositories(owner);

      const status = result.created
        ? `Projet créé : **${result.projectName}**`
        : `Projet déjà existant : **${result.projectName}**`;

      await interaction.editReply({
        content: [
          status,
          `GitHub : **${owner}/${repository}**`,
          `Type : ${result.analysis.type}`,
          `Technologies : ${result.analysis.technologies.join(", ") || "Aucune détectée"}`,
          `Activités synchronisées : ${result.syncedActivities}`,
          "",
          buildMessage(owner, repositories),
        ].join("\n"),
        components: buildComponents(repositories),
      });
    } catch (error) {
      console.error(
        `Erreur import GitHub ${owner}/${repository} :`,
        error,
      );

      await interaction.editReply({
        content: `Impossible d'importer **${owner}/${repository}** : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      });
    }
  },
};
