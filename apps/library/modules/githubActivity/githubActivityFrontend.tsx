import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generative/GitHubActivityJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { ActivityCalendar } from "./ActivityCalendar";
import { githubActivityV1 } from "./githubActivityV1";

export const githubActivityFrontend = makeModuleView(githubActivityV1, {
  default: {
    component: ActivityCalendar,
    generator: { registry, defaultSpec },
  },
});
