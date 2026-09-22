import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { getDecisions } from "../../services/decisionService.js";

export const projectDecisionListCommand = {
 data: new SlashCommandBuilder().setName("project-decision-list").setDescription("Liste les décisions d'un projet").addStringOption((o) => o.setName("projet").setDescription("Projet concerné").setRequired(true).setAutocomplete(true)).addBooleanOption((o) => o.setName("actives").setDescription("Actives uniquement").setRequired(false)),
 async execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const projectId=interaction.options.getString("projet",true); const activeOnly=interaction.options.getBoolean("actives") ?? true; const ds=await getDecisions(projectId); const visible=activeOnly?ds.filter(d=>d.status==="ACTIVE"):ds;
  await interaction.reply(visible.length?visible.slice(0,15).map(d=>"• **"+d.title+"** — "+d.status+"\n  "+d.decision).join("\n"):"Aucune décision correspondante.");
 },
 async autocomplete(interaction: AutocompleteInteraction): Promise<void> { try { const f=interaction.options.getFocused().toLowerCase(); const ps=await getProjects(); await interaction.respond(ps.filter(p=>p.name.toLowerCase().includes(f)).slice(0,25).map(p=>({name:p.name.length>100?p.name.slice(0,97)+"...":p.name,value:p.id}))); } catch(e){console.error(e);await interaction.respond([]);} }
};