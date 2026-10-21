import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../lib/jsonRender/layoutRegistryComponents";
import { linkCardView } from "../LinkCard";
import { linkCopyView } from "../LinkCopy";
import { linkHeroImageView } from "../LinkHeroImage";
import { linkV2 } from "@qrk.sh/zerospin/src/modules/link/linkV2";

export const { registry } = defineRegistry(linkV2.catalog, {
  components: {
    ...layoutRegistryComponents,
    LinkCard: linkCardView.RegistryComponent,
    LinkCopy: linkCopyView.RegistryComponent,
    LinkHeroImage: linkHeroImageView.RegistryComponent,
  },
});
