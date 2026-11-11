import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../../../definition/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../../react/layoutRegistryComponents";
import { imageCardView } from "../ImageCard";
import { ImageCoverRegistry } from "../ImageCover";
import { mediaFooterView } from "../MediaFooter";
import { imageV1 } from "../../definition/imageV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(imageV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      ImageCard: imageCardView.RegistryComponent,
      ImageCover: ImageCoverRegistry,
      MediaFooter: mediaFooterView.RegistryComponent,
    },
  },
);
