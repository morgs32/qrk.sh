import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { CreamSquare1x1 } from "./CreamSquare1x1";
import { CreamSquare2x2 } from "./CreamSquare2x2";
import { CreamSquare4x1 } from "./CreamSquare4x1";

export const creamSquareCollection = makeCollection({
  collectionName: "cream-square",
  collectionLabel: "Cream square",
  bricks: {
    "2x2": makeBrick({
      name: "2x2",
      w: 2,
      h: 2,
      label: "2×2",
      order: 0,
      component: CreamSquare1x1,
    }),
    "4x4": makeBrick({
      name: "4x4",
      w: 4,
      h: 4,
      label: "4×4",
      order: 1,
      component: CreamSquare2x2,
    }),
    "8x2": makeBrick({
      name: "8x2",
      w: 8,
      h: 2,
      label: "8×2",
      order: 2,
      component: CreamSquare4x1,
    }),
  },
});
