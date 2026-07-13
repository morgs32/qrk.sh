import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { PurpleLines1x1 } from "./PurpleLines1x1";
import { PurpleLines2x2 } from "./PurpleLines2x2";
import { PurpleLines4x1 } from "./PurpleLines4x1";

export const purpleLinesCollection = makeCollection({
  collectionName: "purple-lines",
  collectionLabel: "Purple lines",
  bricks: {
    "2x2": makeBrick({
      name: "2x2",
      w: 2,
      h: 2,
      label: "2×2",
      order: 0,
      component: PurpleLines1x1,
    }),
    "4x4": makeBrick({
      name: "4x4",
      w: 4,
      h: 4,
      label: "4×4",
      order: 1,
      component: PurpleLines2x2,
    }),
    "8x2": makeBrick({
      name: "8x2",
      w: 8,
      h: 2,
      label: "8×2",
      order: 2,
      component: PurpleLines4x1,
    }),
  },
});
