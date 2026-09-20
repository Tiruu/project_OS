import { supabase } from "../lib/supabase.js";
import type { CreateTaskInput, Task } from "../types/task.js";
import { createActivity } from "./activityService.js";

export async function getTasks(projectId: string): Promise<Task[]> {
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

export async function createTask(input: CreateTaskInput): Promise<Task> {
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

export async function deleteTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .select()
    .single();

  if (error) {
    throw new Error(`Impossible de supprimer la tâche : ${error.message}`);
  }

  await createActivity({
    project_id: data.project_id,
    type: "TASK_DELETED",
    source: "BOT",
    title: `Tâche supprimée : ${data.title}`,
    metadata: {
      task_id: data.id,
      task_status_before_delete: data.status,
    },
  });

  return data;
}

export async function startTask(taskId: string): Promise<Task> {
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

export async function completeTask(taskId: string): Promise<Task> {
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