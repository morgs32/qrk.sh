import { backendLibrary } from "@qrk.sh/library/backendLibrary";
import { makeModuleSpecContractVersion } from "@qrk.sh/library/makeModuleSpecContractVersion";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const updateMapPlaceSpecAtBreakpoint = makeModuleSpecContractVersion({
  commandName: "updateMapPlaceSpecAtBreakpoint",
  moduleId: "map-place",
  brick: brickV1,
  placement: placementV1,
  components: backendLibrary["map-place"].components,
});
