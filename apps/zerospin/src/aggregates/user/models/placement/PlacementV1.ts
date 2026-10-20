import { makePlacementModel } from "@qrk.sh/library/makePlacementModel";
import { brickV1 } from "../brick/BrickV1";
import { placement } from "./placement";
import { rowV1 } from "../row/RowV1";

export const placementV1 = makePlacementModel({ brick: brickV1, row: rowV1, identity: placement });
