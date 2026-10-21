import { makeModuleView } from "../make/makeModuleView";
import { BrickShell } from "../components/brick/BrickShell";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { githubActivityV2 } from "@qrk.sh/zerospin/src/modules/githubActivity/githubActivityV2";
import { GitHubActivityForm } from "./GitHubActivityForm";
import { activityCalendarView } from "./ActivityCalendar";
import { GitHubActivityPlaceholder } from "./GitHubActivityPlaceholder";
import { GitHubActivityLineIcon } from "./GitHubActivityLineIcon";

export const githubActivityView = makeModuleView(githubActivityV2, {
  LineIcon: GitHubActivityLineIcon,
  form: GitHubActivityForm,
  default: {
    defaultWidth: 656,
    minWidth: 320,
    placeholder() {
      return <GitHubActivityPlaceholder />;
    },
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">This brick has no saved content.</p>;
      return (
        <BrickShell className="bg-white">
          <activityCalendarView.Component contributions={state.data.contributions} />
        </BrickShell>
      );
    },
    generator: { registry, defaultSpec: githubActivityV2.defaultSpec },
  },
});
