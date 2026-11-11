import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../../../definition/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../../react/layoutRegistryComponents";
import { articleBrickContentView } from "../ArticleBrickContent";
import { articleV1 } from "../../definition/articleV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(articleV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      ArticleBrick: articleBrickContentView.RegistryComponent,
    },
  },
);
