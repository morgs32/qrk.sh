import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "@qrk.sh/zerospin/src/modules/make/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../jsonRender/layoutRegistryComponents";
import { instagramCardView } from "../InstagramCard";
import { instagramPostGridView } from "../InstagramPostGrid";
import { instagramMediaFooterView } from "../InstagramMediaFooter";
import { instagramV1 } from "@qrk.sh/zerospin/src/modules/instagram/instagramV1";

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
