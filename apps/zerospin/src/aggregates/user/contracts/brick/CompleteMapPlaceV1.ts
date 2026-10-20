import { makeCompleteMapPlaceContract } from "@qrk.sh/library/modules/mapPlace/makeCompleteMapPlaceContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const completeMapPlace = makeCompleteMapPlaceContract({
  brick: brickV1,
  placement: placementV1,
});
