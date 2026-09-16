import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const githubActivityJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    ActivityCalendar: {
      props: z.object({
        contributions: z.unknown(),
      }),
      description:
        'GitHub contribution calendar. Bind contributions with { "$state": "/contributions" }. Do not invent empty arrays.',
    },
  },
  actions: {},
});
