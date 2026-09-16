import { defineCatalog, DynamicStringSchema } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const linkJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    LinkCard: {
      props: z.object({
        url: DynamicStringSchema,
      }),
      slots: ["default"],
      description:
        'Linked rich-preview card shell. Bind url with { "$state": "/url" } for the href.',
    },
    LinkCopy: {
      props: z.object({
        title: DynamicStringSchema,
        siteName: DynamicStringSchema,
        iconUrl: DynamicStringSchema,
      }),
      description:
        "Left copy column: optional favicon, title, site name. Bind title/siteName/iconUrl from state.",
    },
    LinkHeroImage: {
      props: z.object({
        imageUrl: DynamicStringSchema,
      }),
      description:
        'Right hero image band. Bind imageUrl with { "$state": "/imageUrl" }. Hidden when empty.',
    },
  },
  actions: {},
});
