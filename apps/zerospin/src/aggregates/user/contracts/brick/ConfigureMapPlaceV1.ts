import { makeConfigureMapPlaceContract } from "@qrk.sh/library/modules/mapPlace/makeConfigureMapPlaceContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const configureMapPlace = makeConfigureMapPlaceContract({
  brick: brickV1,
  placement: placementV1,
});
