import { makeTile } from "../../makeTile";
import { makeCollection } from "../../makeCollection";
import { GreenGLogo1x1 } from "./GreenGLogo1x1";
import { GreenGLogo2x2 } from "./GreenGLogo2x2";
import { GreenGLogo4x1 } from "./GreenGLogo4x1";

export const greenGCollection = makeCollection({
  collectionName: "green-g-logo",
  collectionLabel: "Green G",
  tiles: {
    "1x1": makeTile({ name: "1x1", w: 1, h: 1, order: 1, component: GreenGLogo1x1 }),
    "2x2": makeTile({ name: "2x2", w: 2, h: 2, order: 2, component: GreenGLogo2x2 }),
    "4x1": makeTile({ name: "4x1", w: 4, h: 1, order: 0, component: GreenGLogo4x1 }),
  },
});
