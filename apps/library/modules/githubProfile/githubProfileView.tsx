import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/GitHubProfileJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { GitHubProfile } from "./GitHubProfile/GitHubProfile";
import { githubProfileV1 } from "./githubProfileV1";

export const githubProfileView = makeModuleView(githubProfileV1, {
  default: {
    component: GitHubProfile,
    generator: { registry, defaultSpec },
  },
});
