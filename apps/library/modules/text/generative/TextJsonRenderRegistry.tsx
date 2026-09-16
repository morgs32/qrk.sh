import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { TextBrickPresentation } from "../Text/components/TextBrickPresentation";
import { textJsonRenderCatalog } from "./TextJsonRenderCatalog";

export const { registry } = defineRegistry(textJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    TextBrick: ({ props }) => (
      <TextBrickPresentation
        title={typeof props.title === "string" ? props.title : "Text brick"}
        category={typeof props.category === "string" ? props.category : "Sample"}
        w={2}
        h={2}
      />
    ),
  },
});
