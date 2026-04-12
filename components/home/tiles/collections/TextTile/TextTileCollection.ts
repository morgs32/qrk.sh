import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { TextTile2x2 } from "./TextTile2x2";
import { TextTile4x1 } from "./TextTile4x1";

export const textTileCollection = makeCollection({
  collectionName: "text-tile",
  collectionLabel: "Text tile",
  tiles: {
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: TextTile2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 0, component: TextTile4x1 }),
  },
});
