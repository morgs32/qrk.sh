import { addBrick, updateBrick } from "../commands/brickActions";
import { githubProfilePreviewState } from "../definition/githubProfilePreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/GitHubProfileJsonRenderRegistry";
import { githubProfileV1 } from "../definition/githubProfileV1";
import { GitHubProfileForm } from "./GitHubProfileForm";
import { GitHubProfilePlaceholder } from "./GitHubProfilePlaceholder";
import { GitHubProfileLineIcon } from "./GitHubProfileLineIcon";

const githubProfile = makeModuleView(githubProfileV1, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["social", "tools"],
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
    const { brickState, placementState, layoutId, spec } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${githubProfile.label}`}>
        <githubProfile.Render brickState={brickState} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
