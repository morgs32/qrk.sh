import { makeConfigureFigmaThumbnailContract } from "@qrk.sh/library/modules/figmaThumbnail/makeConfigureFigmaThumbnailContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const configureFigmaThumbnail = makeConfigureFigmaThumbnailContract({
  brick: brickV1,
  placement: placementV1,
});
