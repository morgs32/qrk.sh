import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const githubProfileJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ProfileCard: {
      props: z.object({}),
      slots: ["default"],
      description: "Slotted shell for composing a GitHub profile layout.",
    },
    ProfileHeader: {
      props: z.object({}),
      slots: ["default"],
      description: "Avatar and login row.",
    },
    ProfileBody: {
      props: z.object({}),
      slots: ["default"],
      description: "Scrollable body for the header row plus bio, location, and blog lines.",
    },
    ProfileFooter: {
      props: z.object({}),
      slots: ["default"],
      description: "Footer row for follower, following, and repository counts.",
    },
    Avatar: {
      props: z.object({
        avatar_url: z.string(),
        login: z.string(),
      }),
      description: "User avatar image with initials fallback.",
    },
    Login: {
      props: z.object({
        login: z.string(),
      }),
      description: "@login handle.",
    },
    Bio: {
      props: z.object({
        bio: z.string().nullable(),
      }),
      description: "Profile bio text.",
    },
    Location: {
      props: z.object({
        location: z.string().nullable(),
      }),
      description: "Profile location line.",
    },
    Blog: {
      props: z.object({
        blog: z.string(),
      }),
      description: "Profile blog/link line.",
    },
    Followers: {
      props: z.object({
        followers: z.number().int(),
      }),
      description: "Follower count.",
    },
    Following: {
      props: z.object({
        following: z.number().int(),
      }),
      description: "Following count.",
    },
    PublicRepos: {
      props: z.object({
        public_repos: z.number().int(),
      }),
      description: "Public repository count.",
    },
  },
  actions: {},
});
