import { githubProfilePreviewState } from "../definition/githubProfilePreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../react/BrickDetailsTrigger";
import { registry } from "./generator/GitHubProfileJsonRenderRegistry";
import { githubProfileV1 } from "../definition/githubProfileV1";
import { GitHubProfileForm } from "./GitHubProfileForm";
import { GitHubProfilePlaceholder } from "./GitHubProfilePlaceholder";
import { GitHubProfileLineIcon } from "./GitHubProfileLineIcon";

const githubProfile = makeModuleView(githubProfileV1, {
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

export const githubProfileView = {
  ...githubProfile,
  Render(props: Parameters<typeof githubProfile.Render>[0]) {
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${githubProfile.label}`}>
        <githubProfile.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
