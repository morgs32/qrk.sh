import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { GreenEmpty1x1 } from "./GreenEmpty1x1";
import { GreenEmpty2x2 } from "./GreenEmpty2x2";
import { GreenEmpty4x1 } from "./GreenEmpty4x1";

export const swatchCollection = makeCollection({
  collectionName: "swatch",
  collectionLabel: "Swatch",
  collectionDescription: "Solid color fields for visual rhythm.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "A solid color field.",
      sizes: {
        "2x2": makeBrick({
          variant: "default",
          size: "2x2",
          w: 2,
          h: 2,
          label: "2×2",
          order: 1,
          component: GreenEmpty1x1,
        }),
        "4x4": makeBrick({
          variant: "default",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: GreenEmpty2x2,
        }),
        "8x2": makeBrick({
          variant: "default",
          size: "8x2",
          w: 8,
          h: 2,
          label: "8×2",
          order: 2,
          component: GreenEmpty4x1,
        }),
      },
    }),
  },
});
