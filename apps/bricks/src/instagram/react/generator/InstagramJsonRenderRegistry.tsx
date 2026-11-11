import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../../react/layoutRegistryComponents";
import { instagramCardView } from "../InstagramCard";
import { instagramPostGridView } from "../InstagramPostGrid";
import { instagramMediaFooterView } from "../InstagramMediaFooter";
import { instagramV1 } from "../../definition/instagramV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(instagramV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      InstagramCard: instagramCardView.RegistryComponent,
      InstagramPostGrid: instagramPostGridView.RegistryComponent,
      InstagramMediaFooter: instagramMediaFooterView.RegistryComponent,
    },
  },
);
