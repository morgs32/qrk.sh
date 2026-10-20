import { makeModuleView } from "../../make/makeModuleView";
import { BrickShell } from "../../components/brick/BrickShell";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { githubActivityV1 } from "./githubActivityV1";
import { GitHubActivityForm } from "./GitHubActivityForm";
import { activityCalendarView } from "./ActivityCalendar";
import { GitHubActivityPlaceholder } from "./GitHubActivityPlaceholder";
import { GitHubActivityLineIcon } from "./GitHubActivityLineIcon";

export const githubActivityView = makeModuleView(githubActivityV1, {
  LineIcon: GitHubActivityLineIcon,
  configureCommand: "configureGithubActivity",
  form: GitHubActivityForm,
  default: {
    defaultWidth: 656,
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
    generator: { registry, defaultSpec: githubActivityV1.defaultSpec },
  },
});
