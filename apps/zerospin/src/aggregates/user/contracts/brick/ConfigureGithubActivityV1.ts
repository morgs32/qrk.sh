import { makeConfigureGithubActivityContract } from "@qrk.sh/library/modules/githubActivity/makeConfigureGithubActivityContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const configureGithubActivity = makeConfigureGithubActivityContract({
  brick: brickV1,
  placement: placementV1,
});
