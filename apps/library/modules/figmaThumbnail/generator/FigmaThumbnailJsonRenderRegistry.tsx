import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { figmaCardView } from "../FigmaCard";
import { figmaThumbnailBandView } from "../FigmaThumbnailBand";
import { figmaMediaFooterView } from "../FigmaMediaFooter";
import { figmaThumbnailV1 } from "../figmaThumbnailV1";

export const { registry } = defineRegistry(figmaThumbnailV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    FigmaCard: figmaCardView.RegistryComponent,
    FigmaThumbnailBand: figmaThumbnailBandView.RegistryComponent,
    FigmaMediaFooter: figmaMediaFooterView.RegistryComponent,
  },
});
