import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { instagramCardView } from "../InstagramCard";
import { instagramPostGridView } from "../InstagramPostGrid";
import { instagramMediaFooterView } from "../InstagramMediaFooter";
import { instagramV1 } from "../instagramV1";

export const { registry } = defineRegistry(instagramV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    InstagramCard: instagramCardView.RegistryComponent,
    InstagramPostGrid: instagramPostGridView.RegistryComponent,
    InstagramMediaFooter: instagramMediaFooterView.RegistryComponent,
  },
});
