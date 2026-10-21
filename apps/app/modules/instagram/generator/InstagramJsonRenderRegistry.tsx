import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../lib/jsonRender/layoutRegistryComponents";
import { instagramCardView } from "../InstagramCard";
import { instagramPostGridView } from "../InstagramPostGrid";
import { instagramMediaFooterView } from "../InstagramMediaFooter";
import { instagramV2 } from "@qrk.sh/zerospin/src/modules/instagram/instagramV2";

export const { registry } = defineRegistry(instagramV2.catalog, {
  components: {
    ...layoutRegistryComponents,
    InstagramCard: instagramCardView.RegistryComponent,
    InstagramPostGrid: instagramPostGridView.RegistryComponent,
    InstagramMediaFooter: instagramMediaFooterView.RegistryComponent,
  },
});
