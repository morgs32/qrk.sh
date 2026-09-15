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
      w: 4,
      h: 4,
      order: 0,
      xs: ImagePromo4x4,
    }),
  },
});
