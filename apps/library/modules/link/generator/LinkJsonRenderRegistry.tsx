import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { linkCardView } from "../LinkCard";
import { linkCopyView } from "../LinkCopy";
import { linkHeroImageView } from "../LinkHeroImage";
import { linkV1 } from "../linkV1";

export const { registry } = defineRegistry(linkV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    LinkCard: linkCardView.RegistryComponent,
    LinkCopy: linkCopyView.RegistryComponent,
    LinkHeroImage: linkHeroImageView.RegistryComponent,
  },
});
