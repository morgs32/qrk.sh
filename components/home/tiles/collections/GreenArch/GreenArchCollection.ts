import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { GreenArch1x1 } from "./GreenArch1x1";
import { GreenArch2x2 } from "./GreenArch2x2";
import { GreenArch4x1 } from "./GreenArch4x1";

export const greenArchCollection = makeCollection({
  collectionName: "green-arch",
  collectionLabel: "Green arch",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 0, component: GreenArch1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: GreenArch2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: GreenArch4x1 }),
  },
});
