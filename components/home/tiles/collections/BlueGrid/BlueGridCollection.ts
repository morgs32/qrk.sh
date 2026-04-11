import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { BlueGrid1x1 } from "./BlueGrid1x1";
import { BlueGrid2x2 } from "./BlueGrid2x2";
import { BlueGrid4x1 } from "./BlueGrid4x1";

export const blueGridCollection = makeTileCollection({
  collectionId: "blue-grid",
  collectionLabel: "Blue grid",
  tiles: [
    makeTile({ w: 1, h: 1, component: BlueGrid1x1 }),
    makeTile({ w: 2, h: 2, component: BlueGrid2x2 }),
    makeTile({ w: 4, h: 1, component: BlueGrid4x1 }),
  ],
});
