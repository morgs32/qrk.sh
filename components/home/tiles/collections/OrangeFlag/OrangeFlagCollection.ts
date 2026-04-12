import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { OrangeFlag1x1 } from "./OrangeFlag1x1";
import { OrangeFlag2x2 } from "./OrangeFlag2x2";
import { OrangeFlag4x1 } from "./OrangeFlag4x1";

export const orangeFlagCollection = makeCollection({
  collectionName: "orange-flag",
  collectionLabel: "Orange flag",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 1, component: OrangeFlag1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 2, component: OrangeFlag2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 0, component: OrangeFlag4x1 }),
  },
});
