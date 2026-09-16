import { defineCatalog } from "@json-render/core";
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
        avatar_url: z.string(),
        login: z.string(),
      }),
      description:
        "Includes Avatar and Login. Horizontal cluster (avatar next to @login). May live in BrickBody or BrickFooter; no implied parent.",
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
        bio: z.string().nullable(),
      }),
      description: "Profile bio text. No implied parent.",
    },
    Location: {
      props: z.object({
        location: z.string().nullable(),
      }),
      description: "Profile location line. No implied parent.",
    },
    Blog: {
      props: z.object({
        blog: z.string(),
      }),
      description: "Profile blog/link line. No implied parent.",
    },
    Followers: {
      props: z.object({
        followers: z.number().int(),
      }),
      description: "Follower count. No implied parent.",
    },
    Following: {
      props: z.object({
        following: z.number().int(),
      }),
      description: "Following count. No implied parent.",
    },
    PublicRepos: {
      props: z.object({
        public_repos: z.number().int(),
      }),
      description: "Public repository count. No implied parent.",
    },
  },
  actions: {},
});
