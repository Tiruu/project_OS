import { supabase } from "../lib/supabase.js";
export async function getTasks(projectId) {
    const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("priority", { ascending: true });
    if (error) {
        throw new Error(`Impossible de récupérer les tâches : ${error.message}`);
    }
    return data;
}
export async function createTask(input) {
    const { data, error } = await supabase
        .from("tasks")
        .insert({
        project_id: input.project_id,
        title: input.title,
        priority: input.priority ?? 1,
        status: "TODO",
    })
        .select()
        .single();
    if (error) {
        throw new Error(`Impossible de créer la tâche : ${error.message}`);
    }
    return data;
}
