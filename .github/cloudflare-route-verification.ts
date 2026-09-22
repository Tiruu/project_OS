import { askProjectWithAI } from "../src/services/aiService.ts";

const source = "Tiruu/how_far:journal.md";
const excerpt = "P0 — priorité absolue\n30–50 lancers de playtest\n↓\nobserver Safe / Greed / Combo";
const context = {
  repository: {
    name:"how_far", full_name:"Tiruu/how_far", url:"https://github.com/Tiruu/how_far",
    description:"How Far?", default_branch:"main", language:"GDScript", visibility:"public",
  },
  repository_tree:["scripts/main.gd"],
  selected_files:[{path:"scripts/main.gd",reason:"core",content:"throw score combo safe greed ricochet"}],
  project_documents:[{path:"journal.md",kind:"JOURNAL_AUDIT",content:excerpt}],
  readme:"How Far", package_json:null, repositories:[],
  project_os:{
    project:{id:"p1",name:"How Far?",type:"game",technologies:["Godot"],purpose:"Game",description:"Game",current_state:"Validation"},
    active_tasks:[],tasks:[],active_decisions:[],decisions:[],recent_activities:[],
    reference_index:{tasks:[],decisions:[],activities:[]},
  },
} as any;

process.env.AI_PROVIDER="cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID="account/test";
process.env.CLOUDFLARE_API_TOKEN="token";
process.env.CLOUDFLARE_AI_MODEL="@cf/qwen/qwen3-30b-a3b-fp8";
process.env.CLOUDFLARE_MAX_TOKENS="1800";
process.env.CLOUDFLARE_TEMPERATURE="0";

let seenUrl="";
globalThis.fetch=async (input, init)=>{
  seenUrl=String(input);
  if(!seenUrl.endsWith("/ai/run/@cf/qwen/qwen3-30b-a3b-fp8")){
    throw new Error("Bad Cloudflare model URL: "+seenUrl);
  }
  const response={
    answer:"La prochaine étape est la validation.",
    project_state:"Validation.",
    recommendations:[{
      priority_id:"P0",title:"P0 — priorité absolue",why:"Source.",
      detail:excerpt,effort:"À observer",timing:"NOW",evidence:[{source,excerpt}]
    }],
    problems:[],unknowns:[],references:[source],
  };
  return {
    ok:true,status:200,
    async text(){return JSON.stringify({success:true,result:{response:JSON.stringify(response)}});}
  } as any;
};

await askProjectWithAI(context,"Quelle est la prochaine étape du développement ?");
console.log("CLOUDFLARE ROUTE VERIFICATION PASSED:", seenUrl);
