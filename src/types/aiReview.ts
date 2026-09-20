export type AiSuggestedTask = {
  title: string;
  priority: number;
  reason: string;
};

export type AiReview = {
  summary: string;
  purpose: string;
  type: string;
  technologies: string[];
  current_state: string;
  confidence: number;
  uncertainties: string[];
  suggested_tasks: AiSuggestedTask[];
};
