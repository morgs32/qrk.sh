import { githubActivityPreviewState } from "@qrk.sh/zerospin/src/modules/githubActivity/githubActivityPreviewState";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { githubActivityV1 } from "@qrk.sh/zerospin/src/modules/githubActivity/githubActivityV1";
import { GitHubActivityForm } from "./GitHubActivityForm";
import { GitHubActivityPlaceholder } from "./GitHubActivityPlaceholder";
import { GitHubActivityLineIcon } from "./GitHubActivityLineIcon";

export const githubActivityView = makeModuleView(githubActivityV1, {
  defaultState: githubActivityPreviewState,
  LineIcon: GitHubActivityLineIcon,
  form: GitHubActivityForm,
  variants: {
    default: {
      placeholder() {
        return <GitHubActivityPlaceholder />;
      },
      registry,
    },
  },
});
