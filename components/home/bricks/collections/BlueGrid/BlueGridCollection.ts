import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { BlueGrid1x1 } from "./BlueGrid1x1";
import { BlueGrid2x2 } from "./BlueGrid2x2";
import { BlueGrid4x1 } from "./BlueGrid4x1";

export const blueGridCollection = makeCollection({
  collectionName: "blue-grid",
  collectionLabel: "Blue grid",
  bricks: {
    "2x2": makeBrick({ name: "2x2", w: 2, h: 2, label: "2×2", order: 1, component: BlueGrid1x1 }),
    "4x4": makeBrick({ name: "4x4", w: 4, h: 4, label: "4×4", order: 2, component: BlueGrid2x2 }),
    "8x2": makeBrick({ name: "8x2", w: 8, h: 2, label: "8×2", order: 0, component: BlueGrid4x1 }),
  },
});
