import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { CreamBench1x1 } from "./CreamBench1x1";
import { CreamBench2x2 } from "./CreamBench2x2";
import { CreamBench4x1 } from "./CreamBench4x1";

export const creamBenchCollection = makeCollection({
  collectionName: "cream-bench",
  collectionLabel: "Cream bench",
  tiles: {
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 0, component: CreamBench1x1 }),
    "4x4": makeTile({ name: "4x4", w: 4, h: 4, order: 1, component: CreamBench2x2 }),
    "8x2": makeTile({ name: "8x2", w: 8, h: 2, order: 2, component: CreamBench4x1 }),
  },
});
