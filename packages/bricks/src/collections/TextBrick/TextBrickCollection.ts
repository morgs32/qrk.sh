import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { TextBrick2x2 } from "./TextBrick2x2";
import { TextBrick4x1 } from "./TextBrick4x1";

export const textBrickCollection = makeCollection({
  collectionName: "text-brick",
  collectionLabel: "Text brick",
  collectionDescription: "Text blocks for grid content.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "A text content block.",
      sizes: {
        "4x4": makeBrick({
          variant: "default",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 1,
          component: TextBrick2x2,
        }),
        "8x2": makeBrick({
          variant: "default",
          size: "8x2",
          w: 8,
          h: 2,
          label: "8×2",
          order: 0,
          component: TextBrick4x1,
        }),
      },
    }),
  },
});
