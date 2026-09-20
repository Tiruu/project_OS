import { supabase } from "../lib/supabase.js";
import type { CreateDecisionInput, Decision } from "../types/decision.js";
import { createActivity } from "./activityService.js";

export async function getDecisions(projectId: string): Promise<Decision[]> {
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

export async function createDecision(input: CreateDecisionInput): Promise<Decision> {
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
    metadata: { decision_id: data.id },
  });

  return data;
}

async function changeDecisionStatus(
  decisionId: string,
  status: "SUPERSEDED" | "REVERTED",
  activityTitle: string,
): Promise<Decision> {
  const { data, error } = await supabase
    .from("decisions")
    .update({ status })
    .eq("id", decisionId)
    .select()
    .single();

  if (error) {
    throw new Error(`Impossible de modifier la décision : ${error.message}`);
  }

  await createActivity({
    project_id: data.project_id,
    type: "DECISION_STATUS_CHANGED",
    source: "BOT",
    title: activityTitle,
    metadata: {
      decision_id: data.id,
      status,
    },
  });

  return data;
}

export async function supersedeDecision(decisionId: string): Promise<Decision> {
  return changeDecisionStatus(
    decisionId,
    "SUPERSEDED",
    "Décision remplacée",
  );
}

export async function revertDecision(decisionId: string): Promise<Decision> {
  return changeDecisionStatus(
    decisionId,
    "REVERTED",
    "Décision révoquée",
  );
}
