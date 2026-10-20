import { makeCompleteGithubRepoContract } from "@qrk.sh/library/modules/githubRepo/makeCompleteGithubRepoContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const completeGithubRepo = makeCompleteGithubRepoContract({
  brick: brickV1,
  placement: placementV1,
});
