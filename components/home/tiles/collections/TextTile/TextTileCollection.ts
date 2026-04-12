import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { TextTile2x2 } from "./TextTile2x2";
import { TextTile4x1 } from "./TextTile4x1";

export const textTileCollection = makeCollection({
  collectionName: "text-tile",
  collectionLabel: "Text tile",
  tiles: {
    "4x4": makeTile({ name: "4x4", w: 4, h: 4, order: 1, component: TextTile2x2 }),
    "8x2": makeTile({ name: "8x2", w: 8, h: 2, order: 0, component: TextTile4x1 }),
  },
});
