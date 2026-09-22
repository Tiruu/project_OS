import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { getDecisions, revertDecision, supersedeDecision } from "../../services/decisionService.js";

export const projectDecisionUpdateCommand = {
 data: new SlashCommandBuilder().setName("project-decision-update").setDescription("Change le cycle de vie d'une décision")
  .addStringOption((o)=>o.setName("projet").setDescription("Projet concerné").setRequired(true).setAutocomplete(true))
  .addStringOption((o)=>o.setName("decision").setDescription("Décision").setRequired(true).setAutocomplete(true))
  .addStringOption((o)=>o.setName("action").setDescription("Action").setRequired(true).addChoices({name:"Remplacer",value:"SUPERSEDED"},{name:"Révoquer",value:"REVERTED"})),
 async execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const pid=interaction.options.getString("projet",true); const did=interaction.options.getString("decision",true); const action=interaction.options.getString("action",true); const ds=await getDecisions(pid); const d=ds.find(x=>x.id===did);
  if(!d){await interaction.reply("Décision introuvable dans ce projet.");return;} const u=action==="SUPERSEDED"?await supersedeDecision(d.id):await revertDecision(d.id); await interaction.reply("Décision **"+u.title+"** → **"+u.status+"**");
 },
 async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try { const f=interaction.options.getFocused(true); if(f.name==="projet"){const ps=await getProjects(); await interaction.respond(ps.filter(p=>p.name.toLowerCase().includes(f.value.toLowerCase())).slice(0,25).map(p=>({name:p.name.length>100?p.name.slice(0,97)+"...":p.name,value:p.id})));return;} const pid=interaction.options.getString("projet"); if(!pid){await interaction.respond([]);return;} const ds=await getDecisions(pid); await interaction.respond(ds.filter(d=>d.status==="ACTIVE"&&d.title.toLowerCase().includes(f.value.toLowerCase())).slice(0,25).map(d=>({name:d.title.length>100?d.title.slice(0,97)+"...":d.title,value:d.id}))); } catch(e){console.error(e);await interaction.respond([]);} 
 },
};