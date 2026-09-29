import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { githubActivityV1 } from "./githubActivityV1";
import { activityCalendarView } from "./ActivityCalendar";

export const githubActivityView = makeModuleView(githubActivityV1, {
  default: {
    component(props) {
      const { state } = props;
      return <activityCalendarView.Component contributions={state.data.contributions} />;
    },
    generator: { registry, defaultSpec },
  },
});
