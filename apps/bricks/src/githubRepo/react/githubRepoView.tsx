import { githubRepoPreviewState } from "../definition/githubRepoPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/GitHubRepoJsonRenderRegistry";
import { githubRepoV1 } from "../definition/githubRepoV1";
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
