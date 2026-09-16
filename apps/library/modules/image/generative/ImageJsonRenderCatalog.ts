import { defineCatalog, DynamicStringSchema } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const imageJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    ImageCard: {
      props: z.object({}),
      slots: ["default"],
      description:
        "Full-height column for an editorial image brick (media band then MediaFooter).",
    },
    ImageCover: {
      props: z.object({
        imageUrl: DynamicStringSchema,
        title: DynamicStringSchema,
      }),
      description:
        'Cover image band. Bind imageUrl with { "$state": "/imageUrl" } and title with { "$state": "/title" } for alt text.',
    },
    MediaFooter: {
      props: z.object({
        overline: DynamicStringSchema.optional(),
        heading: DynamicStringSchema.optional(),
        iconUrl: DynamicStringSchema.optional(),
      }),
      slots: ["default"],
      description:
        "Pinned media chrome footer (optional iconUrl + overline/heading + optional trailing children).",
    },
  },
  actions: {},
});
