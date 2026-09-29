import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { textBrickContentView } from "../TextBrickContent";
import { textV1 } from "../textV1";

export const { registry } = defineRegistry(textV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    TextBrick: textBrickContentView.RegistryComponent,
  },
});
