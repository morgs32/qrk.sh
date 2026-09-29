import { defineRegistry } from "@json-render/react";

import { iconSvgGraphicView } from "../SwatchAndIcon/components/IconSvgGraphic";
import { swatchAndIconColorView } from "../SwatchAndIcon/components/SwatchAndIconColor";
import { swatchAndIconV1 } from "../swatchAndIconV1";

export const { registry } = defineRegistry(swatchAndIconV1.catalog, {
  components: {
    IconSvgGraphic: iconSvgGraphicView.RegistryComponent,
    SwatchAndIconColor: swatchAndIconColorView.RegistryComponent,
  },
});
