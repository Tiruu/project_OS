export type GithubRepository = {
  id: string;
  project_id: string;
  owner: string;
  repository: string;
  url: string;
  default_branch: string;
  connected_at: string;
};

export type CreateGithubRepositoryInput = {
  project_id: string;
  owner: string;
  repository: string;
  url: string;
  default_branch?: string;
};
