import { makeConfigureLinkContract } from "@qrk.sh/library/modules/link/makeConfigureLinkContract";
import { brickV1 } from "../../models/brick/BrickV1";
import { placementV1 } from "../../models/placement/PlacementV1";

export const configureLink = makeConfigureLinkContract({ brick: brickV1, placement: placementV1 });
