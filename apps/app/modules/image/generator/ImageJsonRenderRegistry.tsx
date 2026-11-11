import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "@qrk.sh/zerospin/src/modules/make/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../jsonRender/layoutRegistryComponents";
import { imageCardView } from "../ImageCard";
import { imageCoverView } from "../ImageCover";
import { mediaFooterView } from "../MediaFooter";
import { imageV1 } from "@qrk.sh/zerospin/src/modules/image/imageV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(imageV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      ImageCard: imageCardView.RegistryComponent,
      ImageCover: imageCoverView.RegistryComponent,
      MediaFooter: mediaFooterView.RegistryComponent,
    },
  },
);
