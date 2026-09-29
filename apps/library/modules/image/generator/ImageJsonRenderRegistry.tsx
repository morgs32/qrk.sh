import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { imageCardView } from "../ImageCard";
import { imageCoverView } from "../ImageCover";
import { mediaFooterView } from "../MediaFooter";
import { imageV1 } from "../imageV1";

export const { registry } = defineRegistry(imageV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    ImageCard: imageCardView.RegistryComponent,
    ImageCover: imageCoverView.RegistryComponent,
    MediaFooter: mediaFooterView.RegistryComponent,
  },
});
