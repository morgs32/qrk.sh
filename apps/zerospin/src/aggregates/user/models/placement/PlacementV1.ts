import { makePlacementModel } from "../../../../modules/make/makePlacementModel";
import { brick } from "../brick/brick";
import { placement } from "./placement";
import { row } from "../row/row";

export const placementV1 = makePlacementModel({ brick, row, identity: placement });
