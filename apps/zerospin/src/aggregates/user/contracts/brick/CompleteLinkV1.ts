import { makeCompleteLinkContract } from "@qrk.sh/library/modules/link/makeCompleteLinkContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const completeLink = makeCompleteLinkContract({ brick: brickV1, placement: placementV1 });
