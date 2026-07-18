import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { makeBrick } from "../../makeBrick";
import { FigmaPromo4x4 } from "./FigmaPromo4x4";

export const figmaCollection = makeCollection({
  collectionName: "figma",
  collectionLabel: "Figma",
  collectionDescription: "A preview of a Figma project.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "A preview of a Figma project.",
      sizes: {
        "4x4": makeBrick({
          variant: "default",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: FigmaPromo4x4,
        }),
      },
    }),
  },
});
