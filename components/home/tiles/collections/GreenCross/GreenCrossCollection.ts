import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { GreenCross1x1 } from "./GreenCross1x1";
import { GreenCross2x2 } from "./GreenCross2x2";
import { GreenCross4x1 } from "./GreenCross4x1";

export const greenCrossCollection = makeCollection({
  collectionName: "green-cross",
  collectionLabel: "Green cross",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 0, component: GreenCross1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: GreenCross2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: GreenCross4x1 }),
  },
});
