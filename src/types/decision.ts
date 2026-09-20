export type DecisionStatus = "ACTIVE" | "SUPERSEDED" | "REVERTED";

export type Decision = {
  id: string;
  project_id: string;
  title: string;
  decision: string;
  reason: string | null;
  consequences: string | null;
  status: DecisionStatus;
  created_at: string;
};

export type CreateDecisionInput = {
  project_id: string;
  title: string;
  decision: string;
  reason?: string;
  consequences?: string;
};
