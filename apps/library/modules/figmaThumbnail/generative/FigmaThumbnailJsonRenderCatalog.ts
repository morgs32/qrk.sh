import {
  defineCatalog,
  DynamicNumberSchema,
  DynamicStringSchema,
} from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const figmaThumbnailJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    FigmaCard: {
      props: z.object({}),
      slots: ["default"],
      description: "Full-height column for a Figma thumbnail brick (media band then footer).",
    },
    FigmaThumbnailBand: {
      props: z.object({
        title: DynamicStringSchema,
        thumbnail_url: z.union([DynamicStringSchema, z.null()]),
        thumbnail_width: z.union([DynamicNumberSchema, z.null()]),
        thumbnail_height: z.union([DynamicNumberSchema, z.null()]),
        imagePosition: DynamicStringSchema,
      }),
      description:
        'Thumbnail media band with grid fallback. Bind thumbnail_url/title/sizes from data and imagePosition from options ({ "$state": "/imagePosition" }).',
    },
    FigmaMediaFooter: {
      props: z.object({
        title: DynamicStringSchema,
        url: DynamicStringSchema,
      }),
      description:
        'Figma-branded media footer with linked title. Bind title and url from state.',
    },
  },
  actions: {},
});
