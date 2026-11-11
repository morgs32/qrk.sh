import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../definition/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../react/layoutRegistryComponents";
import { linkCardView } from "./LinkCard";
import { linkCopyView } from "./LinkCopy";
import { linkHeroImageView } from "./LinkHeroImage";
import { linkV1 } from "../definition/linkV1";

export const { registry: linkReactRegistry } = defineRegistry(
  makeCatalogFromComponentMetadata(linkV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      LinkCard: linkCardView.RegistryComponent,
      LinkCopy: linkCopyView.RegistryComponent,
      LinkHeroImage: linkHeroImageView.RegistryComponent,
    },
  },
);
