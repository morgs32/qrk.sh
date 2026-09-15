import { makeGroup } from "../../makeGroup";
import { makeCatalog } from "../../makeCatalog";

import { ImagePromo4x4 } from "./catalogs/default/ImagePromo4x4";

export const imageGroup = makeGroup({
  id: "image",
  label: "Image",
  description: "An editorial image preview.",
  catalogs: {
    default: makeCatalog({
      dataShape: null,
      defaultData: null,
      id: "default",
      label: "Default",
      description: "An editorial image preview.",
      order: 0,
      xs: { component: ImagePromo4x4, w: 4, h: 4 },
    }),
  },
});
