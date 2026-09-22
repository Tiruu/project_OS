import { supabase } from "../lib/supabase.js";
import type { Activity, CreateActivityInput } from "../types/activity.js";

export async function getActivities(projectId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Impossible de récupérer les activités : ${error.message}`);
  }

  return data;
}

export async function getActivity(
  activityId: string,
): Promise<Activity | null> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("id", activityId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de récupérer l'activité : ${error.message}`,
    );
  }

  return data;
}

export async function createActivity(
  input: CreateActivityInput,
): Promise<Activity> {
  const { data, error } = await supabase
    .from("activities")
    .insert({
      project_id: input.project_id,
      type: input.type,
      source: input.source,
      title: input.title,
      description: input.description,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Impossible de créer l'activité : ${error.message}`);
  }

  return data;
}
