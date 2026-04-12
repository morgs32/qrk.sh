import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { BlackCircle1x1 } from "./BlackCircle1x1";
import { BlackCircle2x2 } from "./BlackCircle2x2";
import { BlackCircle4x1 } from "./BlackCircle4x1";

export const blackCircleCollection = makeCollection({
  collectionName: "black-circle",
  collectionLabel: "Black circle",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 0, component: BlackCircle1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: BlackCircle2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: BlackCircle4x1 }),
  },
});
