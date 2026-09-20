import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { ActivityCalendar } from "./ActivityCalendar";
import { githubActivityV1 } from "./githubActivityV1";

export const githubActivityView = makeModuleView(githubActivityV1, {
  default: {
    component: ActivityCalendar,
    generator: { registry, defaultSpec },
  },
});
