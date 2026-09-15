import { makeCatalog } from "../../makeCatalog";
import { makeRegistry } from "../../makeRegistry";

import { ImagePromo4x4 } from "./ImagePromo4x4";

export const imageCatalog = makeCatalog({
  catalogName: "image",
  catalogLabel: "Image",
  catalogDescription: "An editorial image preview.",
  registries: {
    default: makeRegistry({
      dataShape: null,
      defaultData: null,
      registry: "default",
      registryName: "Default",
      registryDescription: "An editorial image preview.",
      order: 0,
      xs: { component: ImagePromo4x4, w: 4, h: 4 },
    }),
  },
});
