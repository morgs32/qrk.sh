import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { IconSvgGraphic } from "../SwatchAndIcon/components/IconSvgGraphic";
import { SwatchAndIconColor } from "../SwatchAndIcon/components/SwatchAndIconColor";
import { swatchAndIconJsonRenderCatalog } from "./SwatchAndIconJsonRenderCatalog";

export const { registry } = defineRegistry(swatchAndIconJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    SwatchAndIconColor: ({ children, props }) => (
      <SwatchAndIconColor color={typeof props.color === "string" ? props.color : "#4A7C59"}>
        {children}
      </SwatchAndIconColor>
    ),
    IconSvgGraphic: ({ props }) => (
      <IconSvgGraphic
        data={{
          name: typeof props.name === "string" ? props.name : "",
          svg: typeof props.svg === "string" ? props.svg : "",
        }}
      />
    ),
  },
});
