import { githubProfilePreviewState } from "../definition/githubProfilePreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/GitHubProfileJsonRenderRegistry";
import { githubProfileV1 } from "../definition/githubProfileV1";
import { GitHubProfileForm } from "./GitHubProfileForm";
import { GitHubProfilePlaceholder } from "./GitHubProfilePlaceholder";
import { GitHubProfileLineIcon } from "./GitHubProfileLineIcon";

export const githubProfileView = makeModuleView(githubProfileV1, {
  defaultState: githubProfilePreviewState,
  LineIcon: GitHubProfileLineIcon,
  form: GitHubProfileForm,
  variants: {
    default: {
      placeholder() {
        return <GitHubProfilePlaceholder />;
      },
      registry,
    },
  },
});
