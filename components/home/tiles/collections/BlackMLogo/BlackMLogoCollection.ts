import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { BlackMLogo1x1 } from "./BlackMLogo1x1";
import { BlackMLogo2x2 } from "./BlackMLogo2x2";
import { BlackMLogo4x1 } from "./BlackMLogo4x1";

export const blackMCollection = makeTileCollection({
  collectionId: "black-m-logo",
  collectionLabel: "Black M",
  tiles: [
    makeTile({ w: 1, h: 1, component: BlackMLogo1x1 }),
    makeTile({ w: 2, h: 2, component: BlackMLogo2x2 }),
    makeTile({ w: 4, h: 1, component: BlackMLogo4x1 }),
  ],
});
