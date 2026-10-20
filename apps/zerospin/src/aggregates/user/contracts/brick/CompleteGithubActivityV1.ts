import { makeCompleteGithubActivityContract } from "@qrk.sh/library/modules/githubActivity/makeCompleteGithubActivityContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const completeGithubActivity = makeCompleteGithubActivityContract({
  brick: brickV1,
  placement: placementV1,
});
