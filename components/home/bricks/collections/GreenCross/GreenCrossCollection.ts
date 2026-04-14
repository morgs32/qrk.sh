import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { GreenCross1x1 } from "./GreenCross1x1";
import { GreenCross2x2 } from "./GreenCross2x2";
import { GreenCross4x1 } from "./GreenCross4x1";

export const greenCrossCollection = makeCollection({
  collectionName: "green-cross",
  collectionLabel: "Green cross",
  bricks: {
    "2x2": makeBrick({ name: "2x2", w: 2, h: 2, label: "2×2", order: 0, component: GreenCross1x1 }),
    "4x4": makeBrick({ name: "4x4", w: 4, h: 4, label: "4×4", order: 1, component: GreenCross2x2 }),
    "8x2": makeBrick({ name: "8x2", w: 8, h: 2, label: "8×2", order: 2, component: GreenCross4x1 }),
  },
});
