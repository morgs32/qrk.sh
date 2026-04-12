import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { PinkDots1x1 } from "./PinkDots1x1";
import { PinkDots2x2 } from "./PinkDots2x2";
import { PinkDots4x1 } from "./PinkDots4x1";

export const pinkDotsCollection = makeCollection({
  collectionName: "pink-dots",
  collectionLabel: "Pink dots",
  tiles: {
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, label: "2×2", order: 1, component: PinkDots1x1 }),
    "4x4": makeTile({ name: "4x4", w: 4, h: 4, label: "4×4", order: 2, component: PinkDots2x2 }),
    "8x2": makeTile({ name: "8x2", w: 8, h: 2, label: "8×2", order: 0, component: PinkDots4x1 }),
  },
});
