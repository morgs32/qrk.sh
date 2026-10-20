import { backendLibrary } from "@qrk.sh/library/backendLibrary";
import { makeModuleSpecContractVersion } from "@qrk.sh/library/makeModuleSpecContractVersion";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const updateInstagramSpecAtBreakpoint = makeModuleSpecContractVersion({
  commandName: "updateInstagramSpecAtBreakpoint",
  moduleId: "instagram",
  brick: brickV1,
  placement: placementV1,
  components: backendLibrary["instagram"].components,
});
