import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { GreenEmpty1x1 } from "./GreenEmpty1x1";
import { GreenEmpty2x2 } from "./GreenEmpty2x2";
import { GreenEmpty4x1 } from "./GreenEmpty4x1";

export const greenEmptyCollection = makeCollection({
  collectionName: "green-empty",
  collectionLabel: "Green empty",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 1, component: GreenEmpty1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 0, component: GreenEmpty2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 2, component: GreenEmpty4x1 }),
  },
});
