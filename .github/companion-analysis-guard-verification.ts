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
  project_documents: [
    {
      path: "journal.md",
      kind: "JOURNAL_AUDIT",
      content:
        "# Journal\n\n## 52.29.15 Priorités de développement mises à jour\n## P0 — priorité absolue\n" +
        excerpt +
        "\n\n## P1 — robustesse\n- secure stone finish",
    },
  ],
  readme: "How Far",
  package_json: null,
  repositories: [],
  project_os: {
    project: {
      id: "p1", name: "How Far?", type: "game",
      technologies: ["Godot", "GDScript"], purpose: "Ricochet game",
      description: "Throw a stone farther.", current_state: "Validation de la boucle",
    },
    active_tasks: [], tasks: [], active_decisions: [], decisions: [],
    recent_activities: [],
    reference_index: { tasks: [], decisions: [], activities: [] },
  },
} as any;

const planningJson = {
  answer: "La prochaine étape est la validation de la boucle.",
  project_state: "Validation de la boucle.",
  recommendations: [{
    priority_id:"P0", title:"P0 — priorité absolue", why:"Source du journal.",
    detail:excerpt, effort:"À observer", timing:"NOW", evidence:[{source,excerpt}]
  }],
  problems: [], unknowns: [], references:[source],
};

const analysisJson = {
  answer: "La boucle principale est suffisamment structurée pour entrer dans une phase de validation. Mon point de vigilance principal est la calibration : le journal demande d'observer le comportement réel de Safe, Greed et Combo avant de modifier l'équilibre.",
  project_state: "Le projet se trouve en validation de boucle, avec le cœur du lancer, du score et des ricochets déjà représenté dans les fichiers fournis.",
  recommendations: [{
    priority_id:"P0", title:"Valider la boucle sur les 30–50 lancers", why:"Le journal place cette validation en P0.",
    detail:excerpt, effort:"30–50 lancers", timing:"NOW", evidence:[{source,excerpt}]
  }],
  problems: [{
    title:"Calibration encore non validée",
    description:"Le contexte fourni montre une priorité de validation avant calibration.",
    impact:"Modifier l'équilibrage avant l'observation risque de calibrer sur des hypothèses plutôt que sur le comportement réel.",
    evidence:[{source,excerpt}]
  }],
  unknowns:["On ne sait pas encore comment les joueurs répartissent leurs choix entre Safe et Greed."],
  references:[source],
};

let calls=0;

process.env.AI_PROVIDER="cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID="test";
process.env.CLOUDFLARE_API_TOKEN="test";
process.env.CLOUDFLARE_AI_MODEL="@cf/qwen/qwen3-30b-a3b-fp8";
process.env.CLOUDFLARE_MAX_TOKENS="1800";
process.env.CLOUDFLARE_TEMPERATURE="0";

globalThis.fetch = async (_input, init) => {
  calls++;
  const body=JSON.parse(String(init?.body));
  const system=body.messages?.find((m:any)=>m.role==="system")?.content ?? "";
  if(calls===2 && !system.includes("ne commence pas par 'La prochaine étape est...'")){
    throw new Error("Retry hint was not forwarded.");
  }
  const response=calls===1 ? planningJson : analysisJson;
  return {
    ok:true,status:200,
    async text(){ return JSON.stringify({success:true,result:{response:JSON.stringify(response)}}); }
  } as any;
};

const out=await askProjectWithAI(context,"Qu'est-ce que tu penses de l'état actuel du projet ?");

if(calls!==2) throw new Error("Expected analysis drift to trigger one retry.");
if(!out.includes("Calibration encore non validée")) throw new Error("Analysis retry result was not rendered.");
if(!out.includes("### Problèmes détectés")) throw new Error("Problems section missing.");
if(out.includes("La prochaine étape est la validation de la boucle.")) throw new Error("Planning drift leaked into final analysis answer.");

console.log("COMPANION ANALYSIS GUARD VERIFICATION PASSED");
