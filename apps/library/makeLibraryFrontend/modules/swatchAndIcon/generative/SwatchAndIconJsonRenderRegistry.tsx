import type { ReactNode } from "react";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { IconSvgGraphic } from "../SwatchAndIcon/components/IconSvgGraphic";
import { SwatchAndIconColor } from "../SwatchAndIcon/components/SwatchAndIconColor";
import { swatchAndIconV1 } from "../swatchAndIconV1";

export const { registry } = defineRegistry(swatchAndIconV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    SwatchAndIconColor: ({
      children,
      props,
    }: {
      children?: ReactNode;
      props: Record<string, unknown>;
    }) => (
      <SwatchAndIconColor color={typeof props.color === "string" ? props.color : "#4A7C59"}>
        {children}
      </SwatchAndIconColor>
    ),
    IconSvgGraphic: ({ props }: { props: Record<string, unknown> }) => (
      <IconSvgGraphic
        data={{
          name: typeof props.name === "string" ? props.name : "",
          svg: typeof props.svg === "string" ? props.svg : "",
        }}
      />
    ),
  },
});
