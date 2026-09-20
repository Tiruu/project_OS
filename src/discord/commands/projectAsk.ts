import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getProjects } from "../../services/projectService.js";
import { getProjectAiContext } from "../../services/projectAiContextService.js";
import { askProjectWithAI } from "../../services/aiService.js";

export const projectAskCommand={
 data:new SlashCommandBuilder().setName("project-ask").setDescription("Pose une question sur le contexte d'un projet")
  .addStringOption(o=>o.setName("projet").setDescription("Projet").setRequired(true).setAutocomplete(true))
  .addStringOption(o=>o.setName("question").setDescription("Question").setRequired(true)),
 async execute(interaction:ChatInputCommandInteraction):Promise<void>{
  const pid=interaction.options.getString("projet",true); const q=interaction.options.getString("question",true); await interaction.deferReply();
  const context=await getProjectAiContext(pid,q); const answer=await askProjectWithAI(context,q); await interaction.editReply(answer.slice(0,1900));
 },
 async autocomplete(interaction:AutocompleteInteraction):Promise<void>{try{const f=interaction.options.getFocused().toLowerCase();const ps=await getProjects();await interaction.respond(ps.filter(p=>p.name.toLowerCase().includes(f)).slice(0,25).map(p=>({name:p.name.length>100?p.name.slice(0,97)+"...":p.name,value:p.id})));}catch(e){console.error(e);await interaction.respond([]);}}
};