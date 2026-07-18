import { primitives } from "@zerospin/core/models/primitives";
import { Schema } from "effect";

import { makeCollection } from "../../makeCollection";
import { makeBrick } from "../../makeBrick";
import { makeVariant } from "../../makeVariant";
import { GitHubProfile4x2 } from "./GitHubProfile4x2";
import { GitHubProfile4x4 } from "./GitHubProfile4x4";
import { GitHubRepo4x2 } from "./GitHubRepo4x2";

export const githubCollection = makeCollection({
  collectionName: "github",
  collectionLabel: "GitHub",
  collectionDescription: "Profile and repository cards from GitHub.",
  variants: {
    profile: makeVariant({
      variant: "profile",
      variantDescription: "A GitHub profile card.",
      payloadShape: {
        url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
      },
      dataShape: {
        login: primitives.text(),
        avatar_url: primitives.text(),
        name: primitives.text({ nullable: true }),
        bio: primitives.text({ nullable: true }),
        location: primitives.text({ nullable: true }),
        blog: primitives.text(),
        public_repos: primitives.integer(),
        followers: primitives.integer(),
        following: primitives.integer(),
        contributions: primitives.json({
          schema: Schema.mutable(
            Schema.Array(
              Schema.Struct({
                date: Schema.String,
                count: Schema.Int,
                level: Schema.Literal(0, 1, 2, 3, 4),
              }),
            ),
          ),
        }),
      },
      defaultData: {
        id: 1364795,
        node_id: "MDQ6VXNlcjEzNjQ3OTU=",
        avatar_url: "https://avatars.githubusercontent.com/u/1364795?v=4",
        gravatar_id: "",
        url: "https://api.github.com/users/morgs32",
        html_url: "https://github.com/morgs32",
        followers_url: "https://api.github.com/users/morgs32/followers",
        following_url: "https://api.github.com/users/morgs32/following{/other_user}",
        gists_url: "https://api.github.com/users/morgs32/gists{/gist_id}",
        starred_url: "https://api.github.com/users/morgs32/starred{/owner}{/repo}",
        subscriptions_url: "https://api.github.com/users/morgs32/subscriptions",
        organizations_url: "https://api.github.com/users/morgs32/orgs",
        repos_url: "https://api.github.com/users/morgs32/repos",
        events_url: "https://api.github.com/users/morgs32/events{/privacy}",
        received_events_url: "https://api.github.com/users/morgs32/received_events",
        type: "User",
        user_view_type: "public",
        site_admin: false,
        name: "Morgan Intrator",
        company: "@stackshirts ",
        blog: "http://www.morganatwork.com",
        location: "Charlottesville, VA",
        email: null,
        hireable: null,
        bio: "Last action hero",
        twitter_username: null,
        public_repos: 31,
        public_gists: 1,
        followers: 40,
        following: 143,
        created_at: "2012-01-21T20:20:09Z",
        updated_at: "2026-07-15T15:27:35Z",
        login: "morgs32",
        contributions: [
          { date: "2026-07-12", count: 0, level: 0 },
          { date: "2026-07-13", count: 2, level: 1 },
          { date: "2026-07-14", count: 5, level: 2 },
          { date: "2026-07-15", count: 8, level: 3 },
          { date: "2026-07-16", count: 12, level: 4 },
          { date: "2026-07-17", count: 4, level: 2 },
          { date: "2026-07-18", count: 1, level: 1 },
        ],
      },
      getData: ({ api, payload }) => api.githubRepo().getProfile(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "profile",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: GitHubProfile4x4,
        }),
        "4x2": makeBrick({
          variant: "profile",
          size: "4x2",
          w: 4,
          h: 2,
          label: "4×2",
          order: 1,
          component: GitHubProfile4x2,
        }),
      },
    }),
    repo: makeVariant({
      variant: "repo",
      variantDescription: "A GitHub repository card.",
      sizes: {
        "4x2": makeBrick({
          variant: "repo",
          size: "4x2",
          w: 4,
          h: 2,
          label: "4×2",
          order: 1,
          component: GitHubRepo4x2,
        }),
      },
    }),
  },
});
