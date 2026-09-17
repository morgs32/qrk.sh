import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubActivityJsonRenderRegistry";
import { ActivityCalendar } from "./ActivityCalendar";
import { githubActivityV1 } from "./githubActivityV1";

export const githubActivityFrontend = makeFrontend(githubActivityV1, {
  registry,
  component: ActivityCalendar,
});
