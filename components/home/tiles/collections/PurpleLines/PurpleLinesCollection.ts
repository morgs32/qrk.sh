import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { PurpleLines1x1 } from "./PurpleLines1x1";
import { PurpleLines2x2 } from "./PurpleLines2x2";
import { PurpleLines4x1 } from "./PurpleLines4x1";

export const purpleLinesCollection = makeCollection({
  collectionName: "purple-lines",
  collectionLabel: "Purple lines",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 0, component: PurpleLines1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: PurpleLines2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: PurpleLines4x1 }),
  },
});
