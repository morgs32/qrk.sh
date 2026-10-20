import { makeConfigureGithubRepoContract } from "@qrk.sh/library/modules/githubRepo/makeConfigureGithubRepoContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const configureGithubRepo = makeConfigureGithubRepoContract({
  brick: brickV1,
  placement: placementV1,
});
