import { makeCompleteInstagramContract } from "@qrk.sh/library/modules/instagram/makeCompleteInstagramContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const completeInstagram = makeCompleteInstagramContract({
  brick: brickV1,
  placement: placementV1,
});
