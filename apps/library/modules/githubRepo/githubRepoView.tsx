import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/GitHubRepoJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { GitHubRepo } from "./GitHubRepo/GitHubRepo";
import { githubRepoV1 } from "./githubRepoV1";

export const githubRepoView = makeModuleView(githubRepoV1, {
  default: {
    component: GitHubRepo,
    generator: { registry, defaultSpec },
  },
});
