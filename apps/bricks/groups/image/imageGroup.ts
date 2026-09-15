import { makeGroup } from "../../makeGroup";
import { makeCatalog } from "../../makeCatalog";

import { ImageDefaultPromo } from "./catalogs/default/ImageDefaultPromo";

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
      xs: { component: ImageDefaultPromo, w: 4, h: 4 },
    }),
  },
});
