export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type TaskOrigin =
  | "USER"
  | "AI_REVIEW"
  | "GITHUB"
  | "SYSTEM";

export type TaskKind =
  | "TASK"
  | "BUG"
  | "INCOMPLETE"
  | "DESIGN_GAP"
  | "REFACTOR"
  | "DOCUMENTATION"
  | "TEST";

export type Task = {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  created_at: string;
  completed_at: string | null;
  description: string | null;
  kind: TaskKind;
  origin: TaskOrigin;
  metadata: Record<string, unknown>;
};

export type CreateTaskInput = {
  project_id: string;
  title: string;
  priority?: number;
  description?: string;
  kind?: TaskKind;
  origin?: TaskOrigin;
  metadata?: Record<string, unknown>;
};
