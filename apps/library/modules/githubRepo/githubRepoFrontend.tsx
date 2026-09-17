import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubRepoJsonRenderRegistry";
import { githubRepo } from "./githubRepo";

export const githubRepoFrontend = makeFrontend(githubRepo, {
  registry,
});
