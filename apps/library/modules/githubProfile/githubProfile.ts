import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeModule } from "../../makeModule";

import { GitHubProfileStats } from "./GitHubProfileStats";

export const githubProfile = makeModule({
  id: "github-profile",
  label: "GitHub Profile",
  description: "A GitHub profile card.",
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
    },
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.githubRepo().getProfile(moduleOptions.url);
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
  },
  sm: { component: GitHubProfileStats, w: 4, h: 4 },
  md: { component: GitHubProfileStats, w: 4, h: 3 },
});
