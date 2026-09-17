import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubProfileJsonRenderRegistry";
import { GitHubProfile } from "./GitHubProfile/GitHubProfile";
import { githubProfile } from "./githubProfile";

export const githubProfileFrontend = makeFrontend(githubProfile, {
  registry,
  component: GitHubProfile,
});
