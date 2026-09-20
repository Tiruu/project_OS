export type GithubDiscoveredRepository = {
  owner: string;
  name: string;
  full_name: string;
  url: string;
  description: string | null;
  language: string | null;
  visibility: string;
  default_branch: string;
  alreadyImported: boolean;
};
