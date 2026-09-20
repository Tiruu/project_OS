import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { discoverGithubRepositories } from "../../services/githubDiscoveryService.js";

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
    const available = repositories.filter(
      (repository) => !repository.alreadyImported,
    );
    const imported = repositories.filter(
      (repository) => repository.alreadyImported,
    );

    if (repositories.length === 0) {
      await interaction.editReply(
        `Aucun dépôt trouvé pour **${owner}**.`,
      );
      return;
    }

    const lines = [
      `**Dépôts GitHub de ${owner}**`,
      "",
      `Disponibles pour import : **${available.length}**`,
      ...available.slice(0, 15).map((repository) => {
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

    if (available.length > 15) {
      lines.push(
        "",
        `... et ${available.length - 15} autre(s) dépôt(s).`,
      );
    }

    await interaction.editReply(lines.join("\n"));
  },
};
