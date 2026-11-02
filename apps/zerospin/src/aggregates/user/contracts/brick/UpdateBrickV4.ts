import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { updateBrickV3 } from "./UpdateBrickV3";

export const updateBrickV4 = upgradeAggregateContractRelease(updateBrickV3, {
  version: 4,
  models: { wall, placement },
  operations: { updatePlacement: placement.operations.update },
});
