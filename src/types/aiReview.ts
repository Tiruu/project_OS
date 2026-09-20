export type AiObservedFeature = {
  name: string;
  description: string;
  evidence: string[];
};

export type AiSuggestedTask = {
  title: string;
  priority: number;
  reason: string;
  evidence: string[];
  confidence: number;
};

export type AiReview = {
  summary: string;
  purpose: string;
  type: string;
  technologies: string[];
  inferred_state: string;
  state_evidence: string[];
  observed_features: AiObservedFeature[];
  confidence: number;
  uncertainties: string[];
  suggested_tasks: AiSuggestedTask[];
};
