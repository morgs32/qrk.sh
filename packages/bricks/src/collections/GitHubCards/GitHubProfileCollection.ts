import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { makeCollection } from "../../makeCollection";
import { makeContent } from "../../makeContent";
import { GitHubProfileWideXs } from "./GitHubProfileWideXs";
import { GitHubProfileWideSm } from "./GitHubProfileWideSm";
import { makeView } from "../../makeView";
import { GitHubProfileSquareXs } from "./GitHubProfileSquareXs";
import { GitHubProfileSquareMd } from "./GitHubProfileSquareMd";
import { GitHubRepo4x2 } from "./GitHubRepo4x2";

export const githubCollection = makeCollection({
  collectionName: "github",
  collectionLabel: "GitHub",
  collectionDescription: "Profile and repository cards from GitHub.",
  contents: {
    profile: makeContent({
      content: "profile",
      contentName: "Profile",
      contentDescription: "A GitHub profile card.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
        },
        fetcher: async ({ api, contentOptions, setData }) => {
          const result = await api.githubRepo().getProfile(contentOptions.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
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
                level: Schema.Literals([0, 1, 2, 3, 4]),
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
        contributions: Array.from({ length: 365 }, (_, index) => {
          const date = new Date();
          date.setUTCDate(date.getUTCDate() - (364 - index));

          // Mix each day's index to avoid repeating stripes while keeping samples stable.
          let sample = Math.imul(index + 1, 0x45d9f3b);
          sample = Math.imul(sample ^ (sample >>> 16), 0x45d9f3b);
          sample = (sample ^ (sample >>> 16)) >>> 0;
          const count = sample % 100 < 30 ? 0 : 1 + (sample % 15);
          const level: 0 | 1 | 2 | 3 | 4 =
            count === 0 ? 0 : count <= 3 ? 1 : count <= 7 ? 2 : count <= 11 ? 3 : 4;

          return { date: date.toISOString().slice(0, 10), count, level };
        }),
      },
      views: {
        "4x4": makeView({
          id: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          xs: GitHubProfileSquareXs, md: GitHubProfileSquareMd,
        }),
        "4x2": makeView({
          id: "4x2",
          w: 4,
          h: 2,
          label: "4×2",
          order: 1,
          xs: GitHubProfileWideXs, sm: GitHubProfileWideSm,
        }),
      },
    }),
    repo: makeContent({
      dataShape: null,
      defaultData: null,
      content: "repo",
      contentName: "Repo",
      contentDescription: "A GitHub repository card.",
      views: {
        "4x2": makeView({
          id: "4x2",
          w: 4,
          h: 2,
          label: "4×2",
          order: 1,
          xs: GitHubRepo4x2,
        }),
      },
    }),
  },
});
