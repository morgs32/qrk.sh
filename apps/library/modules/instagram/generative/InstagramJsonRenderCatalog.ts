import { defineCatalog, DynamicStringSchema } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const instagramJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    InstagramCard: {
      props: z.object({
        username: DynamicStringSchema,
      }),
      slots: ["default"],
      description:
        'Linked Instagram profile card shell. Bind username with { "$state": "/username" } for the profile href.',
    },
    InstagramPostGrid: {
      props: z.object({
        username: DynamicStringSchema,
        postImageUrl1: DynamicStringSchema,
        postImageUrl2: DynamicStringSchema,
        postImageUrl3: DynamicStringSchema,
        postImageUrl4: DynamicStringSchema,
      }),
      description:
        "2x2 latest-posts image grid. Bind the four postImageUrl* fields and username for alt text.",
    },
    InstagramMediaFooter: {
      props: z.object({
        username: DynamicStringSchema,
        followersText: DynamicStringSchema,
      }),
      description:
        'Instagram-branded media footer with @username and followersText. Bind both from state.',
    },
  },
  actions: {},
});
