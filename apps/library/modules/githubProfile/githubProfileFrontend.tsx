import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubProfileJsonRenderRegistry";
import { GitHubProfile } from "./GitHubProfile/GitHubProfile";
import { githubProfileV1 } from "./githubProfileV1";

export const githubProfileFrontend = makeFrontend(githubProfileV1, {
  registry,
  component: GitHubProfile,
});
