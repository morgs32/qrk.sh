import { defineCatalog, DynamicStringSchema } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const swatchAndIconJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    SwatchAndIconColor: {
      props: z.object({
        color: DynamicStringSchema,
      }),
      slots: ["default"],
      description:
        'Solid color field shell. Bind color with { "$state": "/color" } (from module options).',
    },
    IconSvgGraphic: {
      props: z.object({
        name: DynamicStringSchema,
        svg: DynamicStringSchema,
      }),
      description:
        'Centered SVG icon. Bind name with { "$state": "/name" } and svg with { "$state": "/svg" }.',
    },
  },
  actions: {},
});
