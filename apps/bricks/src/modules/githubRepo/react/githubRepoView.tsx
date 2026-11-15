import { addBrick, updateBrick } from "../commands/brickActions";
import { githubRepoPreviewState } from "../definition/githubRepoPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/GitHubRepoJsonRenderRegistry";
import { githubRepoV1 } from "../definition/githubRepoV1";
import { GitHubRepoForm } from "./GitHubRepoForm";
import { GitHubRepoPlaceholder } from "./GitHubRepoPlaceholder";
import { GitHubRepoLineIcon } from "./GitHubRepoLineIcon";

const githubRepo = makeModuleView(githubRepoV1, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["tools"],
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

export const githubRepoView = {
  ...githubRepo,
  Render(props: Parameters<typeof githubRepo.Render>[0]) {
    const { brickState, placementState, layoutId, spec } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${githubRepo.label}`}>
        <githubRepo.Render brickState={brickState} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
