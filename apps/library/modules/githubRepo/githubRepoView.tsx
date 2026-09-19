import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generative/GitHubRepoJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { GitHubRepo } from "./GitHubRepo/GitHubRepo";
import { githubRepoV1 } from "./githubRepoV1";

export const githubRepoView = makeModuleView(githubRepoV1, {
  default: {
    component: GitHubRepo,
    generator: { registry, defaultSpec },
  },
});
