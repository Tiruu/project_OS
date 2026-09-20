export type ActivityType =
  | "PROJECT_CREATED"
  | "TASK_CREATED"
  | "TASK_STARTED"
  | "TASK_COMPLETED"
  | "STATUS_CHANGED"
  | "NOTE_ADDED"
  | "DECISION_CREATED"
  | "PR_OPENED"
  | "PR_UPDATED"
  | "PR_MERGED"
  | "COMMIT"
  | "RELEASE"
  | "AI_REVIEW"
  | "AI_TASK_CREATED"
  | "AI_TASK_IGNORED";

export type Activity = {
  id: string;
  project_id: string;
  type: ActivityType;
  source: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreateActivityInput = {
  project_id: string;
  type: ActivityType;
  source: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
};
