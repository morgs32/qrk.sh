import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { CreamSquare1x1 } from "./CreamSquare1x1";
import { CreamSquare2x2 } from "./CreamSquare2x2";
import { CreamSquare4x1 } from "./CreamSquare4x1";

export const creamSquareCollection = makeCollection({
  collectionName: "cream-square",
  collectionLabel: "Cream square",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 0, component: CreamSquare1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: CreamSquare2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: CreamSquare4x1 }),
  },
});
