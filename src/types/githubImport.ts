export type GithubImportAnalysis = {
  owner: string;
  repository: string;
  url: string;
  default_branch: string;
  name: string;
  description: string | null;
  technologies: string[];
  type: string;
};
