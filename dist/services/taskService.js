import { supabase } from "../lib/supabase.js";
import { createActivity } from "./activityService.js";
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
    await createActivity({
        project_id: input.project_id,
        type: "TASK_CREATED",
        source: "BOT",
        title: `Tâche créée : ${data.title}`,
        metadata: {
            task_id: data.id,
        },
    });
    return data;
}
export async function startTask(taskId) {
    const { data, error } = await supabase
        .from("tasks")
        .update({
        status: "IN_PROGRESS",
    })
        .eq("id", taskId)
        .select()
        .single();
    if (error) {
        throw new Error(`Impossible de démarrer la tâche : ${error.message}`);
    }
    await createActivity({
        project_id: data.project_id,
        type: "TASK_STARTED",
        source: "BOT",
        title: `Tâche démarrée : ${data.title}`,
        metadata: {
            task_id: data.id,
        },
    });
    return data;
}
export async function completeTask(taskId) {
    const { data, error } = await supabase
        .from("tasks")
        .update({
        status: "DONE",
        completed_at: new Date().toISOString(),
    })
        .eq("id", taskId)
        .select()
        .single();
    if (error) {
        throw new Error(`Impossible de terminer la tâche : ${error.message}`);
    }
    await createActivity({
        project_id: data.project_id,
        type: "TASK_COMPLETED",
        source: "BOT",
        title: `Tâche terminée : ${data.title}`,
        metadata: {
            task_id: data.id,
        },
    });
    return data;
}
