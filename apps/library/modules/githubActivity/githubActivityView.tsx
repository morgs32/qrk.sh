import { makeModuleView } from "../../make/makeModuleView";
import { BrickShell } from "../../components/brick/BrickShell";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { githubActivityV1 } from "./githubActivityV1";
import { activityCalendarView } from "./ActivityCalendar";

export const githubActivityView = makeModuleView(githubActivityV1, {
  default: {
    component(props) {
      const { state } = props;
      return (
        <BrickShell className="bg-white">
          <activityCalendarView.Component contributions={state.data.contributions} />
        </BrickShell>
      );
    },
    generator: { registry, defaultSpec },
  },
});
