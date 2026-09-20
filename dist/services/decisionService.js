import { supabase } from "../lib/supabase.js";
import { createActivity } from "./activityService.js";
export async function getDecisions(projectId) {
    const { data, error } = await supabase
        .from("decisions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
    if (error) {
        throw new Error(`Impossible de récupérer les décisions : ${error.message}`);
    }
    return data;
}
export async function createDecision(input) {
    const { data, error } = await supabase
        .from("decisions")
        .insert({
        project_id: input.project_id,
        title: input.title,
        decision: input.decision,
        reason: input.reason,
        consequences: input.consequences,
        status: "ACTIVE",
    })
        .select()
        .single();
    if (error) {
        throw new Error(`Impossible de créer la décision : ${error.message}`);
    }
    await createActivity({
        project_id: input.project_id,
        type: "DECISION_CREATED",
        source: "BOT",
        title: `Décision enregistrée : ${data.title}`,
        metadata: {
            decision_id: data.id,
        },
    });
    return data;
}
