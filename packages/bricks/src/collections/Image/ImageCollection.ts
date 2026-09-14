import { makeCollection } from "../../makeCollection";
import { makeContent } from "../../makeContent";
import { makeView } from "../../makeView";
import { ImagePromo4x4 } from "./ImagePromo4x4";

export const imageCollection = makeCollection({
  collectionName: "image",
  collectionLabel: "Image",
  collectionDescription: "An editorial image preview.",
  contents: {
    default: makeContent({
      dataShape: null,
      defaultData: null,
      content: "default",
      contentName: "Default",
      contentDescription: "An editorial image preview.",
      views: {
        "4x4": makeView({
          id: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          xs: ImagePromo4x4,
        }),
      },
    }),
  },
});
