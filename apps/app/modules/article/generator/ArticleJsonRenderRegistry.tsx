import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "@qrk.sh/zerospin/src/modules/make/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../jsonRender/layoutRegistryComponents";
import { articleBrickContentView } from "../ArticleBrickContent";
import { articleV1 } from "@qrk.sh/zerospin/src/modules/article/articleV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(articleV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      ArticleBrick: articleBrickContentView.RegistryComponent,
    },
  },
);
