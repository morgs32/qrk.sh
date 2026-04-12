import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { GreenArch1x1 } from "./GreenArch1x1";
import { GreenArch2x2 } from "./GreenArch2x2";
import { GreenArch4x1 } from "./GreenArch4x1";

export const greenArchCollection = makeCollection({
  collectionName: "green-arch",
  collectionLabel: "Green arch",
  tiles: {
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 0, component: GreenArch1x1 }),
    "4x4": makeTile({ name: "4x4", w: 4, h: 4, order: 1, component: GreenArch2x2 }),
    "8x2": makeTile({ name: "8x2", w: 8, h: 2, order: 2, component: GreenArch4x1 }),
  },
});
