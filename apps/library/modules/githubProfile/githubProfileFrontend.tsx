import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubProfileJsonRenderRegistry";
import { githubProfile } from "./githubProfile";

export const githubProfileFrontend = makeFrontend(githubProfile, {
  registry,
});
