import { githubRepoPreviewState } from "@qrk.sh/zerospin/src/modules/githubRepo/githubRepoPreviewState";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/GitHubRepoJsonRenderRegistry";
import { githubRepoV1 } from "@qrk.sh/zerospin/src/modules/githubRepo/githubRepoV1";
import { GitHubRepoForm } from "./GitHubRepoForm";
import { GitHubRepoPlaceholder } from "./GitHubRepoPlaceholder";
import { GitHubRepoLineIcon } from "./GitHubRepoLineIcon";

export const githubRepoView = makeModuleView(githubRepoV1, {
  defaultState: githubRepoPreviewState,
  LineIcon: GitHubRepoLineIcon,
  form: GitHubRepoForm,
  variants: {
    default: {
      placeholder() {
        return <GitHubRepoPlaceholder />;
      },
      registry,
    },
  },
});
