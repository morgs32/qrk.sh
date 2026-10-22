import { makePlacementModel } from "../../../../modules/make/makePlacementModel";
import { brick } from "../brick/brick";
import { placement } from "./placement";
import { wall } from "../wall/wall";

export const placementV1 = makePlacementModel({ brick, wall, identity: placement });
