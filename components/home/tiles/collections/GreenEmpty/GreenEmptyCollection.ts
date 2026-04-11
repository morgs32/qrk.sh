import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { GreenEmpty1x1 } from "./GreenEmpty1x1";
import { GreenEmpty2x2 } from "./GreenEmpty2x2";
import { GreenEmpty4x1 } from "./GreenEmpty4x1";

export const greenEmptyCollection = makeTileCollection({
  collectionId: "green-empty",
  collectionLabel: "Green empty",
  tiles: [
    makeTile({ w: 1, h: 1, component: GreenEmpty1x1 }),
    makeTile({ w: 2, h: 2, component: GreenEmpty2x2 }),
    makeTile({ w: 4, h: 1, component: GreenEmpty4x1 }),
  ],
});
