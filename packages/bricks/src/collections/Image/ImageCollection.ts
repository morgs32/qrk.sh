import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { makeBrick } from "../../makeBrick";
import { ImagePromo4x4 } from "./ImagePromo4x4";

export const imageCollection = makeCollection({
  collectionName: "image",
  collectionLabel: "Image",
  collectionDescription: "An editorial image preview.",
  variants: {
    default: makeVariant({
      dataShape: null,
      defaultData: null,
      variant: "default",
      variantName: "Default",
      variantDescription: "An editorial image preview.",
      layouts: {
        "4x4": makeBrick({
          variant: "default",
          layout: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: ImagePromo4x4,
        }),
      },
    }),
  },
});
