import {
  defineCatalog,
  DynamicNumberSchema,
  DynamicStringSchema,
} from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const githubProfileJsonRenderCatalog = defineCatalog(schema, {
  components: {
    BrickShell: {
      props: z.object({}),
      slots: ["default"],
      description:
        "Column shell for the card. Children paint top-to-bottom; typically BrickBody then BrickFooter.",
    },
    AvatarAndUsername: {
      props: z.object({
        avatar_url: DynamicStringSchema,
        login: DynamicStringSchema,
      }),
      description:
        'Horizontal cluster (avatar next to @login). Bind avatar_url with { "$state": "/avatar_url" } and login with { "$state": "/login" }. Do not invent empty literals. May live in BrickBody or BrickFooter; no implied parent.',
    },
    BrickBody: {
      props: z.object({}),
      slots: ["default"],
      description:
        "Scrollable flex-1 band. Last child here still sits above BrickFooter. Put content here only when it should scroll with the body, not pin to the card bottom.",
    },
    BrickFooter: {
      props: z.object({}),
      slots: ["default"],
      description:
        "Pinned bottom band (mt-auto). Put content here when the user asks for the bottom of the card. Accepts any children (identity, stats, or other leaves); not reserved for counts.",
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
