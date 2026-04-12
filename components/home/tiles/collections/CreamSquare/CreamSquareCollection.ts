import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { CreamSquare1x1 } from "./CreamSquare1x1";
import { CreamSquare2x2 } from "./CreamSquare2x2";
import { CreamSquare4x1 } from "./CreamSquare4x1";

export const creamSquareCollection = makeCollection({
  collectionName: "cream-square",
  collectionLabel: "Cream square",
  tiles: {
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 0, component: CreamSquare1x1 }),
    "4x4": makeTile({ name: "4x4", w: 4, h: 4, order: 1, component: CreamSquare2x2 }),
    "8x2": makeTile({ name: "8x2", w: 8, h: 2, order: 2, component: CreamSquare4x1 }),
  },
});
