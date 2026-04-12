import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { GreenGLogo1x1 } from "./GreenGLogo1x1";
import { GreenGLogo2x2 } from "./GreenGLogo2x2";
import { GreenGLogo4x1 } from "./GreenGLogo4x1";

export const greenGCollection = makeCollection({
  collectionName: "green-g-logo",
  collectionLabel: "Green G",
  tiles: {
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 1, component: GreenGLogo1x1 }),
    "4x4": makeTile({ name: "4x4", w: 4, h: 4, order: 2, component: GreenGLogo2x2 }),
    "8x2": makeTile({ name: "8x2", w: 8, h: 2, order: 0, component: GreenGLogo4x1 }),
  },
});
