import { makeTile } from "../../makeTile";
import { makeTileCollection } from "../../makeTileCollection";
import { PinkAsterisk1x1 } from "./PinkAsterisk1x1";
import { PinkAsterisk2x2 } from "./PinkAsterisk2x2";
import { PinkAsterisk4x1 } from "./PinkAsterisk4x1";

export const pinkAsteriskCollection = makeTileCollection({
  collectionId: "pink-asterisk",
  collectionLabel: "Pink asterisk",
  popular: "4x1",
  tiles: [
    makeTile({ name: "1x1", w: 1, h: 1, component: PinkAsterisk1x1 }),
    makeTile({ name: "2x2", w: 2, h: 2, component: PinkAsterisk2x2 }),
    makeTile({ name: "4x1", w: 4, h: 1, component: PinkAsterisk4x1 }),
  ],
});
