export type Project = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  type: string;
  technologies: string[];
  purpose: string | null;
  description: string | null;
  current_state: string | null;
};

export type CreateProjectInput = {
  name: string;
  type: string;
  technologies: string[];
  purpose?: string;
  description?: string;
  current_state?: string;
};

export type UpdateProjectInput = {
  name?: string;
  type?: string;
  technologies?: string[];
  purpose?: string | null;
  description?: string | null;
  current_state?: string | null;
};