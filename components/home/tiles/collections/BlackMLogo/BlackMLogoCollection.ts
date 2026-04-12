import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { BlackMLogo1x1 } from "./BlackMLogo1x1";
import { BlackMLogo2x2 } from "./BlackMLogo2x2";
import { BlackMLogo4x1 } from "./BlackMLogo4x1";

export const blackMCollection = makeCollection({
  collectionName: "black-m-logo",
  collectionLabel: "Black M",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 0, component: BlackMLogo1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: BlackMLogo2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: BlackMLogo4x1 }),
  },
});
