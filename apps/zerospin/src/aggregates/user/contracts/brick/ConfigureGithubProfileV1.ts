import { makeConfigureGithubProfileContract } from "@qrk.sh/library/modules/githubProfile/makeConfigureGithubProfileContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const configureGithubProfile = makeConfigureGithubProfileContract({
  brick: brickV1,
  placement: placementV1,
});
