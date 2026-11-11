import { githubRepoPreviewState } from "../definition/githubRepoPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/GitHubRepoJsonRenderRegistry";
import { githubRepoV1 } from "../definition/githubRepoV1";
import { GitHubRepoForm } from "./GitHubRepoForm";
import { GitHubRepoPlaceholder } from "./GitHubRepoPlaceholder";
import { GitHubRepoLineIcon } from "./GitHubRepoLineIcon";

const githubRepo = makeModuleView(githubRepoV1, {
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
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${githubRepo.label}`}>
        <githubRepo.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
