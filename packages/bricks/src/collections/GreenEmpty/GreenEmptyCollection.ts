import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { GreenEmpty1x1 } from "./GreenEmpty1x1";
import { GreenEmpty2x2 } from "./GreenEmpty2x2";
import { GreenEmpty4x1 } from "./GreenEmpty4x1";

export const greenEmptyCollection = makeCollection({
  collectionName: "green-empty",
  collectionLabel: "Green empty",
  bricks: {
    "2x2": makeBrick({ name: "2x2", w: 2, h: 2, label: "2×2", order: 1, component: GreenEmpty1x1 }),
    "4x4": makeBrick({ name: "4x4", w: 4, h: 4, label: "4×4", order: 0, component: GreenEmpty2x2 }),
    "8x2": makeBrick({ name: "8x2", w: 8, h: 2, label: "8×2", order: 2, component: GreenEmpty4x1 }),
  },
});
