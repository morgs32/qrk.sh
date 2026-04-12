import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { CreamBench1x1 } from "./CreamBench1x1";
import { CreamBench2x2 } from "./CreamBench2x2";
import { CreamBench4x1 } from "./CreamBench4x1";

export const creamBenchCollection = makeCollection({
  collectionName: "cream-bench",
  collectionLabel: "Cream bench",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 0, component: CreamBench1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: CreamBench2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: CreamBench4x1 }),
  },
});
