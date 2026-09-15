import { makeModule } from "../../makeModule";

import { GitHubRepoCompact } from "./GitHubRepoCompact";
import { GitHubRepoStack } from "./GitHubRepoStack";

export const githubRepo = makeModule({
  dataShape: null,
  defaultData: null,
  id: "github-repo",
  label: "GitHub Repo",
  description: "A GitHub repository card.",
  sm: { component: GitHubRepoStack, w: 4, h: 4 },
  md: { component: GitHubRepoCompact, w: 4, h: 2 }});
