import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { avatarAndUsernameComponent } from "./generator/AvatarAndUsernameComponent";
import { bioComponent } from "./generator/BioComponent";
import { blogComponent } from "./generator/BlogComponent";
import { followersComponent } from "./generator/FollowersComponent";
import { followingComponent } from "./generator/FollowingComponent";
import { locationComponent } from "./generator/LocationComponent";
import { publicReposComponent } from "./generator/PublicReposComponent";
import { githubProfile } from "./githubProfile";

const payloadShape = {
  url: primitives.text({ defaultValue: "https://github.com/octocat" }),
};

const dataShape = {
  login: primitives.text(),
  avatar_url: primitives.text(),
  name: primitives.text({ nullable: true }),
  bio: primitives.text({ nullable: true }),
  location: primitives.text({ nullable: true }),
  blog: primitives.text(),
  public_repos: primitives.integer(),
  followers: primitives.integer(),
  following: primitives.integer(),
};

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

export const githubProfileV1 = makeModuleVersion(githubProfile, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    AvatarAndUsername: avatarAndUsernameComponent,
    Bio: bioComponent,
    Location: locationComponent,
    Blog: blogComponent,
    Followers: followersComponent,
    Following: followingComponent,
    PublicRepos: publicReposComponent,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "https://github.com/octocat" },
    data: defaultData,
  },
});
