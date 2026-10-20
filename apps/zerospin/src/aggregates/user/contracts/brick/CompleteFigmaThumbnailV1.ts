import { makeCompleteFigmaThumbnailContract } from "@qrk.sh/library/modules/figmaThumbnail/makeCompleteFigmaThumbnailContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const completeFigmaThumbnail = makeCompleteFigmaThumbnailContract({
  brick: brickV1,
  placement: placementV1,
});
