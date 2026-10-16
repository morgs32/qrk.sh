import { makeModuleView } from "../../make/makeModuleView";
import { BrickShell } from "../../components/brick/BrickShell";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { githubActivityV1 } from "./githubActivityV1";
import { GitHubActivityForm } from "./GitHubActivityForm";
import { activityCalendarView } from "./ActivityCalendar";
import { GitHubActivityPlaceholder } from "./GitHubActivityPlaceholder";

export const githubActivityView = makeModuleView(githubActivityV1, {
  form: GitHubActivityForm,
  default: {
    placeholder() {
      return <GitHubActivityPlaceholder />;
    },
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">{state.resolution.error?.message ?? "Resolving…"}</p>;
      return (
        <BrickShell className="bg-white">
          <activityCalendarView.Component contributions={state.data.contributions} />
        </BrickShell>
      );
    },
    generator: { registry, defaultSpec },
  },
});
