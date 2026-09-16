import { defineCatalog, DynamicStringSchema } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const textJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    TextBrick: {
      props: z.object({
        title: DynamicStringSchema,
        category: DynamicStringSchema,
      }),
      description:
        "Sample text brick presentation banner. Bind title/category or use literals for the sample chrome.",
    },
  },
  actions: {},
});
