import { makeGroup } from "../../makeGroup";
import { makeCatalog } from "../../makeCatalog";

import { ImagePromo4x4 } from "./ImagePromo4x4";

export const imageGroup = makeGroup({
  groupName: "image",
  groupLabel: "Image",
  groupDescription: "An editorial image preview.",
  catalogs: {
    default: makeCatalog({
      dataShape: null,
      defaultData: null,
      catalog: "default",
      catalogName: "Default",
      catalogDescription: "An editorial image preview.",
      order: 0,
      xs: { component: ImagePromo4x4, w: 4, h: 4 },
    }),
  },
});
