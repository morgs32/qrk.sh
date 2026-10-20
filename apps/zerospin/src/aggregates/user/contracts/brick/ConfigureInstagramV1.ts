import { makeConfigureInstagramContract } from "@qrk.sh/library/modules/instagram/makeConfigureInstagramContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const configureInstagram = makeConfigureInstagramContract({
  brick: brickV1,
  placement: placementV1,
});
