export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type Task = {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  created_at: string;
  completed_at: string | null;
};

export type CreateTaskInput = {
  project_id: string;
  title: string;
  priority?: number;
};
