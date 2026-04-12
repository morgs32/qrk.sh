import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { BlackMLogo1x1 } from "./BlackMLogo1x1";
import { BlackMLogo2x2 } from "./BlackMLogo2x2";
import { BlackMLogo4x1 } from "./BlackMLogo4x1";

export const blackMCollection = makeCollection({
  collectionName: "black-m-logo",
  collectionLabel: "Black M",
  tiles: {
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, label: "2×2", order: 0, component: BlackMLogo1x1 }),
    "4x4": makeTile({ name: "4x4", w: 4, h: 4, label: "4×4", order: 1, component: BlackMLogo2x2 }),
    "8x2": makeTile({ name: "8x2", w: 8, h: 2, label: "8×2", order: 2, component: BlackMLogo4x1 }),
  },
});
