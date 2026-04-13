import { makeCollection } from "../../makeCollection";
import { makeTile } from "../../makeTile";
import { ImagePromo4x4 } from "./ImagePromo4x4";

export const imageCollection = makeCollection({
  collectionName: "image",
  collectionLabel: "Image",
  tiles: {
    "4x4": makeTile({
      name: "4x4",
      w: 4,
      h: 4,
      label: "4×4",
      order: 0,
      component: ImagePromo4x4,
    }),
  },
});
