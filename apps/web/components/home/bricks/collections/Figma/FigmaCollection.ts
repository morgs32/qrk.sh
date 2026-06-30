import { makeCollection } from "../../makeCollection";
import { makeBrick } from "../../makeBrick";
import { FigmaPromo4x4 } from "./FigmaPromo4x4";

export const figmaCollection = makeCollection({
  collectionName: "figma",
  collectionLabel: "Figma",
  bricks: {
    "4x4": makeBrick({
      name: "4x4",
      w: 4,
      h: 4,
      label: "4×4",
      order: 0,
      component: FigmaPromo4x4,
    }),
  },
});
