import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../../react/layoutRegistryComponents";
import { figmaCardView } from "../FigmaCard";
import { figmaThumbnailBandView } from "../FigmaThumbnailBand";
import { figmaMediaFooterView } from "../FigmaMediaFooter";
import { figmaThumbnailV1 } from "../../definition/figmaThumbnailV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(figmaThumbnailV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      FigmaCard: figmaCardView.RegistryComponent,
      FigmaThumbnailBand: figmaThumbnailBandView.RegistryComponent,
      FigmaMediaFooter: figmaMediaFooterView.RegistryComponent,
    },
  },
);
