import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { BlackCircle1x1 } from "./BlackCircle1x1";
import { BlackCircle2x2 } from "./BlackCircle2x2";
import { BlackCircle4x1 } from "./BlackCircle4x1";

export const blackCircleCollection = makeTileCollection({
  collectionId: "black-circle",
  collectionLabel: "Black circle",
  tiles: [
    makeTile({ w: 1, h: 1, component: BlackCircle1x1 }),
    makeTile({ w: 2, h: 2, component: BlackCircle2x2 }),
    makeTile({ w: 4, h: 1, component: BlackCircle4x1 }),
  ],
});
