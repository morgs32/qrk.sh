import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { BlackCircle1x1 } from "./BlackCircle1x1";
import { BlackCircle2x2 } from "./BlackCircle2x2";
import { BlackCircle4x1 } from "./BlackCircle4x1";

export const blackCircleCollection = makeCollection({
  collectionName: "black-circle",
  collectionLabel: "Black circle",
  bricks: {
    "2x2": makeBrick({
      name: "2x2",
      w: 2,
      h: 2,
      label: "2×2",
      order: 0,
      component: BlackCircle1x1,
    }),
    "4x4": makeBrick({
      name: "4x4",
      w: 4,
      h: 4,
      label: "4×4",
      order: 1,
      component: BlackCircle2x2,
    }),
    "8x2": makeBrick({
      name: "8x2",
      w: 8,
      h: 2,
      label: "8×2",
      order: 2,
      component: BlackCircle4x1,
    }),
  },
});
