import { backendLibrary } from "@qrk.sh/library/backendLibrary";
import { makeModuleSpecContractVersion } from "@qrk.sh/library/makeModuleSpecContractVersion";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const updateFigmaThumbnailSpecAtBreakpoint = makeModuleSpecContractVersion({
  commandName: "updateFigmaThumbnailSpecAtBreakpoint",
  moduleId: "figma-thumbnail",
  brick: brickV1,
  placement: placementV1,
  components: backendLibrary["figma-thumbnail"].components,
});
