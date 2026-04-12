import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { BlueGrid1x1 } from "./BlueGrid1x1";
import { BlueGrid2x2 } from "./BlueGrid2x2";
import { BlueGrid4x1 } from "./BlueGrid4x1";

export const blueGridCollection = makeCollection({
  collectionName: "blue-grid",
  collectionLabel: "Blue grid",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 1, component: BlueGrid1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 2, component: BlueGrid2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 0, component: BlueGrid4x1 }),
  },
});
