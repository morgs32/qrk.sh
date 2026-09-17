import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubRepoJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { GitHubRepo } from "./GitHubRepo/GitHubRepo";
import { githubRepoV1 } from "./githubRepoV1";

export const githubRepoFrontend = makeFrontend(githubRepoV1, {
  registry,
  component: GitHubRepo,
  defaultSpec,
});
