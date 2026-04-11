import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { PurpleLines1x1 } from "./PurpleLines1x1";
import { PurpleLines2x2 } from "./PurpleLines2x2";
import { PurpleLines4x1 } from "./PurpleLines4x1";

export const purpleLinesCollection = makeTileCollection({
  collectionId: "purple-lines",
  collectionLabel: "Purple lines",
  popular: "1x1",
  tiles: [
    makeTile({ name: "1x1", w: 1, h: 1, component: PurpleLines1x1 }),
    makeTile({ name: "2x2", w: 2, h: 2, component: PurpleLines2x2 }),
    makeTile({ name: "4x1", w: 4, h: 1, component: PurpleLines4x1 }),
  ],
});
