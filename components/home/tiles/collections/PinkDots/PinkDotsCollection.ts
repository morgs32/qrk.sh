import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { PinkDots1x1 } from "./PinkDots1x1";
import { PinkDots2x2 } from "./PinkDots2x2";
import { PinkDots4x1 } from "./PinkDots4x1";

export const pinkDotsCollection = makeCollection({
  collectionName: "pink-dots",
  collectionLabel: "Pink dots",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 1, component: PinkDots1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 2, component: PinkDots2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 0, component: PinkDots4x1 }),
  },
});
