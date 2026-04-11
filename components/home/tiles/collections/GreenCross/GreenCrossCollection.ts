import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { GreenCross1x1 } from "./GreenCross1x1";
import { GreenCross2x2 } from "./GreenCross2x2";
import { GreenCross4x1 } from "./GreenCross4x1";

export const greenCrossCollection = makeTileCollection({
  collectionId: "green-cross",
  collectionLabel: "Green cross",
  popular: "1x1",
  tiles: [
    makeTile({ name: "1x1", w: 1, h: 1, component: GreenCross1x1 }),
    makeTile({ name: "2x2", w: 2, h: 2, component: GreenCross2x2 }),
    makeTile({ name: "4x1", w: 4, h: 1, component: GreenCross4x1 }),
  ],
});
