import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/GitHubActivityJsonRenderRegistry";
import { ActivityCalendar } from "./ActivityCalendar";
import { githubActivity } from "./githubActivity";

export const githubActivityFrontend = makeFrontend(githubActivity, {
  registry,
  component: ActivityCalendar,
});
