import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { PinkAsterisk1x1 } from "./PinkAsterisk1x1";
import { PinkAsterisk2x2 } from "./PinkAsterisk2x2";
import { PinkAsterisk4x1 } from "./PinkAsterisk4x1";

export const pinkAsteriskCollection = makeCollection({
  collectionName: "pink-asterisk",
  collectionLabel: "Pink asterisk",
  bricks: {
    "2x2": makeBrick({ name: "2x2", w: 2, h: 2, label: "2×2", order: 1, component: PinkAsterisk1x1 }),
    "4x4": makeBrick({ name: "4x4", w: 4, h: 4, label: "4×4", order: 2, component: PinkAsterisk2x2 }),
    "8x2": makeBrick({ name: "8x2", w: 8, h: 2, label: "8×2", order: 0, component: PinkAsterisk4x1 }),
  },
});
