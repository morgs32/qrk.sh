import { makeCompleteGithubProfileContract } from "@qrk.sh/library/modules/githubProfile/makeCompleteGithubProfileContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const completeGithubProfile = makeCompleteGithubProfileContract({
  brick: brickV1,
  placement: placementV1,
});
