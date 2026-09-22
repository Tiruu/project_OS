import { askProjectWithAI } from "../src/services/aiService.ts";

const source = "Tiruu/how_far:journal.md";
const excerpt =
  "P0 — priorité absolue\n30–50 lancers de playtest\n↓\nobserver Safe / Greed / Combo\n↓\nobserver compréhension et plaisir\n↓\ncalibrer";

const context = {
  repository: {
    name: "how_far",
    full_name: "Tiruu/how_far",
    url: "https://github.com/Tiruu/how_far",
    description: "How Far?",
    default_branch: "main",
    language: "GDScript",
    visibility: "public",
  },
  repository_tree: ["scripts/main.gd", "scripts/score_rules.gd"],
  selected_files: [
    { path: "scripts/main.gd", reason: "core", content: "combo score throw stone ricochet charge safe greed overcharge" },
    { path: "scripts/score_rules.gd", reason: "core", content: "score combo overcharge record" },
  ],
  project_documents: [{
    path: "journal.md",
    kind: "JOURNAL_AUDIT",
    content:
      "# Journal\n\n## 52.29.15 Priorités de développement mises à jour\n## P0 — priorité absolue\n" +
      excerpt + "\n\n## P1 — robustesse\n- secure stone finish",
  }],
  readme: "How Far",
  package_json: null,
  repositories: [],
  project_os: {
    project: {
      id:"p1", name:"How Far?", type:"game",
      technologies:["Godot","GDScript"], purpose:"Ricochet game",
      description:"Throw a stone farther.", current_state:"Validation de la boucle",
    },
    active_tasks: [], tasks: [], active_decisions: [], decisions: [],
    recent_activities: [], reference_index:{tasks:[],decisions:[],activities:[]},
  },
} as any;

const planningJson = {
  answer:"La prochaine étape est la validation de la boucle.",
  project_state:"Validation de la boucle.",
  recommendations:[{
    priority_id:"P0",title:"P0 — priorité absolue",why:"Source.",
    detail:excerpt,effort:"À observer",timing:"NOW",evidence:[{source,excerpt}]
  }],
  problems:[],unknowns:[],references:[source],
};

const analysisJson = {
  answer:"Le cœur de la boucle est suffisamment structuré pour passer en validation. Mon principal point de vigilance est la calibration avant observation réelle.",
  project_state:"Le projet est en validation de boucle.",
  recommendations:[{
    priority_id:"P0",title:"Valider la boucle sur le volume prévu",why:"Le journal place cette validation avant la calibration.",
    detail:excerpt,effort:"30–50 lancers",timing:"NOW",evidence:[{source,excerpt}]
  }],
  problems:[{
    title:"Calibration non encore validée",
    description:"Le contexte demande d'observer avant de calibrer.",
    impact:"Risque de modifier l'équilibre sur des hypothèses.",
    evidence:[{source,excerpt}]
  }],
  unknowns:["Le comportement réel des choix Safe/Greed reste à observer."],
  references:[source],
};

let calls = 0;
process.env.AI_PROVIDER="cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID="test";
process.env.CLOUDFLARE_API_TOKEN="test";
process.env.CLOUDFLARE_AI_MODEL="@cf/qwen/qwen3-30b-a3b-fp8";

globalThis.fetch = async (_input, init) => {
  calls++;
  const body=JSON.parse(String(init?.body));
  const user=body.messages?.find((m:any)=>m.role==="user")?.content ?? "";
  const request=JSON.parse(user).PROJECT_COMPANION_REQUEST;

  if (calls === 1 && request.is_project_analysis_request !== true) {
    throw new Error("Analysis intent was not detected.");
  }

  const response = calls === 1 ? planningJson : analysisJson;

  return {
    ok:true,
    status:200,
    async text(){ return JSON.stringify({success:true,result:{response:JSON.stringify(response)}}); }
  } as any;
};

const result=await askProjectWithAI(
  context,
  "Qu’est-ce que tu penses de l’état actuel du projet ?",
);

if (calls !== 2) {
  throw new Error("Expected one corrective retry after the intentionally bad first response.");
}

if (!result.includes("### Problèmes détectés")) {
  throw new Error("Analysis response did not render its problem section.");
}

if (result.includes("La prochaine étape est la validation de la boucle.")) {
  throw new Error("Planning-only answer leaked through analysis mode.");
}

console.log("FINAL INTENT VERIFICATION PASSED");
