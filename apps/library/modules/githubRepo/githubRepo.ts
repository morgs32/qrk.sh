import { makeModule } from "../../make/makeModule";

import { defaultSpec } from "./generative/defaultSpec";
import { GitHubRepoBrick } from "./generative/GitHubRepoBrick";
import { registry } from "./generative/GitHubRepoJsonRenderRegistry";

export const githubRepo = makeModule({
  dataShape: null,
  defaultData: null,
  id: "github-repo",
  label: "GitHub Repo",
  description: "A GitHub repository card.",
  defaultSpec,
  registry,
  brick: GitHubRepoBrick,
  sm: { w: 4, h: 4 },
  md: { w: 4, h: 2 },
  lg: { w: 2, h: 2 },
});
