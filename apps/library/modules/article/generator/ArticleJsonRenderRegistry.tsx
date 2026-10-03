import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { articleBrickContentView } from "../ArticleBrickContent";
import { articleV1 } from "../articleV1";

export const { registry } = defineRegistry(articleV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    ArticleBrick: articleBrickContentView.RegistryComponent,
  },
});
