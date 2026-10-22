import { makeModuleView } from "../make/makeModuleView";
import { BrickShell } from "../components/brick/BrickShell";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { githubActivityV1 } from "@qrk.sh/zerospin/src/modules/githubActivity/githubActivityV1";
import { GitHubActivityForm } from "./GitHubActivityForm";
import { activityCalendarView } from "./ActivityCalendar";
import { GitHubActivityPlaceholder } from "./GitHubActivityPlaceholder";
import { GitHubActivityLineIcon } from "./GitHubActivityLineIcon";

export const githubActivityView = makeModuleView(githubActivityV1, {
  LineIcon: GitHubActivityLineIcon,
  form: GitHubActivityForm,
  variants: {
    default: {
      placeholder() {
        return <GitHubActivityPlaceholder />;
      },
      component(props) {
        const { state } = props;
        if (state.data === null) return <p role="status">This brick has no saved content.</p>;
        return (
          <BrickShell className="bg-white">
            <activityCalendarView.Component contributions={state.data.contributions} />
          </BrickShell>
        );
      },
      generator: { registry, defaultSpec: githubActivityV1.defaultSpec },
    },
  },
});
