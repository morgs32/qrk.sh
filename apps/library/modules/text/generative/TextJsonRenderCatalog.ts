import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const textJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    TextBrick: {
      props: z.object({
        content: z.unknown().nullable().optional(),
      }),
      description:
        "Read-only TipTap document. Bind content from module data ($state /content).",
    },
  },
  actions: {},
});
