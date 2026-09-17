import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubRepoJsonRenderRegistry";
import { GitHubRepo } from "./GitHubRepo/GitHubRepo";
import { githubRepo } from "./githubRepo";

export const githubRepoFrontend = makeFrontend(githubRepo, {
  registry,
  component: GitHubRepo,
});
