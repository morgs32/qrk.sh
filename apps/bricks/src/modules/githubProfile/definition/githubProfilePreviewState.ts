import type { IInferDecodedRow } from "@zerospin/shapes";
import type { githubProfileV1 } from "./githubProfileV1";

const defaultData = {
  id: 1364795,
  node_id: "MDQ6VXNlcjEzNjQ3OTU=",
  avatar_url: "https://github.com/octocat.png",
  gravatar_id: "",
  url: "https://api.github.com/users/octocat",
  html_url: "https://github.com/octocat",
  followers_url: "https://api.github.com/users/octocat/followers",
  following_url: "https://api.github.com/users/octocat/following{/other_user}",
  gists_url: "https://api.github.com/users/octocat/gists{/gist_id}",
  starred_url: "https://api.github.com/users/octocat/starred{/owner}{/repo}",
  subscriptions_url: "https://api.github.com/users/octocat/subscriptions",
  organizations_url: "https://api.github.com/users/octocat/orgs",
  repos_url: "https://api.github.com/users/octocat/repos",
  events_url: "https://api.github.com/users/octocat/events{/privacy}",
  received_events_url: "https://api.github.com/users/octocat/received_events",
  type: "User",
  user_view_type: "public",
  site_admin: false,
  name: "The Octocat",
  company: "@github",
  blog: "https://www.qrk.sh",
  location: "San Francisco, CA",
  email: null,
  hireable: null,
  bio: "Collecting stars and exploring the web.",
  twitter_username: null,
  public_repos: 24,
  public_gists: 1,
  followers: 128,
  following: 42,
  created_at: "2012-01-21T20:20:09Z",
  updated_at: "2026-07-15T15:27:35Z",
  login: "octocat",
};

export const githubProfilePreviewState = {
  payload: { url: "https://github.com/octocat" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof githubProfileV1.stateShape>;
