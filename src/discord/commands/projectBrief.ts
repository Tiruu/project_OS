import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { getProjectBrief } from "../../services/projectBriefService.js";

export const projectBriefCommand = {
  data: new SlashCommandBuilder().setName("project-brief").setDescription("Donne le brief opérationnel d'un projet")
    .addStringOption((option) => option.setName("projet").setDescription("Projet concerné").setRequired(true).setAutocomplete(true)),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const projectId = interaction.options.getString("projet", true);
    const b = await getProjectBrief(projectId);
    const lines: string[] = [];
    lines.push("# " + b.project.name + " — Brief", "", "**État** " + (b.project.current_state ?? "Non défini"), "**But** " + (b.project.purpose ?? b.project.description ?? "Non déterminé"), "");
    lines.push("**À faire maintenant**");
    const active = b.inProgressTasks.length ? b.inProgressTasks : b.todoTasks;
    lines.push(...(active.length ? active.slice(0, 3).map((t) => "• " + t.title + " — priorité " + t.priority + (t.origin !== "USER" ? " — " + t.origin : "")) : ["Aucune tâche active"]), "");
    lines.push("**Points d'attention**");
    lines.push(...(b.staleInProgressTasks.length ? b.staleInProgressTasks.map((t) => "• Tâche en cours depuis plusieurs jours : " + t.title) : ["• Aucun blocage temporel évident"]), "");
    lines.push("**Décisions actives**", ...(b.activeDecisions.length ? b.activeDecisions.slice(0, 5).map((d) => "• " + d.title) : ["• Aucune"]), "");
    lines.push("**GitHub récent**", ...(b.recentGithubActivities.length ? b.recentGithubActivities.slice(0, 5).map((a) => "• " + a.title) : ["• Aucune activité GitHub récente"]), "");
    lines.push("**Dernière activité**", b.latestActivityAt ? new Date(b.latestActivityAt).toLocaleString("fr-FR") : "Aucune");
    await interaction.reply(lines.join("\n"));
  },
  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const focused = interaction.options.getFocused().toLowerCase();
      const projects = await getProjects();
      await interaction.respond(projects.filter((p) => p.name.toLowerCase().includes(focused)).slice(0, 25).map((p) => ({ name: p.name.length > 100 ? p.name.slice(0, 97) + "..." : p.name, value: p.id })));
    } catch (error) { console.error("Erreur autocomplete project-brief :", error); await interaction.respond([]); }
  },
};