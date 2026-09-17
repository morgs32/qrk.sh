import { defineCatalog, DynamicNumberSchema, DynamicStringSchema } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const githubProfileJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    AvatarAndUsername: {
      props: z.object({
        avatar_url: DynamicStringSchema,
        login: DynamicStringSchema,
      }),
      description:
        'Horizontal cluster (avatar next to @login). Bind avatar_url with { "$state": "/avatar_url" } and login with { "$state": "/login" }. Do not invent empty literals. May live in BrickBody or BrickFooter; no implied parent.',
    },
    Bio: {
      props: z.object({
        bio: z.union([DynamicStringSchema, z.null()]),
      }),
      description:
        'Profile bio text. Bind bio with { "$state": "/bio" }. Do not invent empty literals. No implied parent.',
    },
    Location: {
      props: z.object({
        location: z.union([DynamicStringSchema, z.null()]),
      }),
      description:
        'Profile location line. Bind location with { "$state": "/location" }. Do not invent empty literals. No implied parent.',
    },
    Blog: {
      props: z.object({
        blog: DynamicStringSchema,
      }),
      description:
        'Profile blog/link line. Bind blog with { "$state": "/blog" }. Do not invent empty literals. No implied parent.',
    },
    Followers: {
      props: z.object({
        followers: DynamicNumberSchema,
      }),
      description:
        'Follower count. Bind followers with { "$state": "/followers" }. Do not invent empty literals. No implied parent.',
    },
    Following: {
      props: z.object({
        following: DynamicNumberSchema,
      }),
      description:
        'Following count. Bind following with { "$state": "/following" }. Do not invent empty literals. No implied parent.',
    },
    PublicRepos: {
      props: z.object({
        public_repos: DynamicNumberSchema,
      }),
      description:
        'Public repository count. Bind public_repos with { "$state": "/public_repos" }. Do not invent empty literals. No implied parent.',
    },
  },
  actions: {},
});
