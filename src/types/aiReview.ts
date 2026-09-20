export type AiEvidenceKind = "DIRECT" | "INDIRECT";

export type AiEvidence = {
  kind: AiEvidenceKind;
  source: string;
  claim: string;
};

export type AiObservedFeature = {
  name: string;
  description: string;
  evidence: AiEvidence[];
};

export type AiTaskKind =
  | "BUG"
  | "INCOMPLETE"
  | "DESIGN_GAP"
  | "REFACTOR"
  | "DOCUMENTATION"
  | "TEST";

export type AiSuggestedTask = {
  title: string;
  task_kind: AiTaskKind;
  priority: number;
  problem: string;
  reason: string;
  evidence: AiEvidence[];
  confidence: number;
};

export type AiReview = {
  summary: string;
  purpose: string;
  type: string;
  technologies: string[];
  inferred_state: string;
  state_evidence: AiEvidence[];
  observed_features: AiObservedFeature[];
  confidence: number;
  uncertainties: string[];
  suggested_tasks: AiSuggestedTask[];
};
