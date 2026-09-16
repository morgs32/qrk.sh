import { makeModule } from "../../make/makeModule";

import { GitHubRepo } from "./GitHubRepo/GitHubRepo";

export const githubRepo = makeModule({
  dataShape: null,
  defaultData: null,
  id: "github-repo",
  label: "GitHub Repo",
  description: "A GitHub repository card.",
  sm: { component: GitHubRepo, w: 4, h: 4 },
  md: { component: GitHubRepo, w: 4, h: 2 },
  lg: { component: GitHubRepo, w: 2, h: 2 },
});
