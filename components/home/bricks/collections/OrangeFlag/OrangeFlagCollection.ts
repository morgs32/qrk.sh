import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { OrangeFlag1x1 } from "./OrangeFlag1x1";
import { OrangeFlag2x2 } from "./OrangeFlag2x2";
import { OrangeFlag4x1 } from "./OrangeFlag4x1";

export const orangeFlagCollection = makeCollection({
  collectionName: "orange-flag",
  collectionLabel: "Orange flag",
  bricks: {
    "2x2": makeBrick({ name: "2x2", w: 2, h: 2, label: "2×2", order: 1, component: OrangeFlag1x1 }),
    "4x4": makeBrick({ name: "4x4", w: 4, h: 4, label: "4×4", order: 2, component: OrangeFlag2x2 }),
    "8x2": makeBrick({ name: "8x2", w: 8, h: 2, label: "8×2", order: 0, component: OrangeFlag4x1 }),
  },
});
