import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { CreamBench1x1 } from "./CreamBench1x1";
import { CreamBench2x2 } from "./CreamBench2x2";
import { CreamBench4x1 } from "./CreamBench4x1";

export const creamBenchCollection = makeTileCollection({
  collectionId: "cream-bench",
  collectionLabel: "Cream bench",
  tiles: [
    makeTile({ w: 1, h: 1, component: CreamBench1x1 }),
    makeTile({ w: 2, h: 2, component: CreamBench2x2 }),
    makeTile({ w: 4, h: 1, component: CreamBench4x1 }),
  ],
});
