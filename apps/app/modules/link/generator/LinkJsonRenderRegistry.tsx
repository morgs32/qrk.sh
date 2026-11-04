import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "@qrk.sh/zerospin/src/modules/make/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../lib/jsonRender/layoutRegistryComponents";
import { linkCardView } from "../LinkCard";
import { linkCopyView } from "../LinkCopy";
import { linkHeroImageView } from "../LinkHeroImage";
import { linkV1 } from "@qrk.sh/zerospin/src/modules/link/linkV1";

export const { registry } = defineRegistry(
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
