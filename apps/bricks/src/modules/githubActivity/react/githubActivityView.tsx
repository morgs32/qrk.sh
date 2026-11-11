import { githubActivityPreviewState } from "../definition/githubActivityPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/GitHubActivityJsonRenderRegistry";
import { githubActivityV1 } from "../definition/githubActivityV1";
import { GitHubActivityForm } from "./GitHubActivityForm";
import { GitHubActivityPlaceholder } from "./GitHubActivityPlaceholder";
import { GitHubActivityLineIcon } from "./GitHubActivityLineIcon";

const githubActivity = makeModuleView(githubActivityV1, {
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

export const githubActivityView = {
  ...githubActivity,
  Render(props: Parameters<typeof githubActivity.Render>[0]) {
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${githubActivity.label}`}>
        <githubActivity.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
