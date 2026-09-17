import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { avatarAndUsernameComponent } from "./generative/AvatarAndUsernameComponent";
import { bioComponent } from "./generative/BioComponent";
import { blogComponent } from "./generative/BlogComponent";
import { followersComponent } from "./generative/FollowersComponent";
import { followingComponent } from "./generative/FollowingComponent";
import { locationComponent } from "./generative/LocationComponent";
import { publicReposComponent } from "./generative/PublicReposComponent";
import { githubProfile } from "./githubProfile";

const payloadShape = {
  url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
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
    payload: { url: "https://github.com/morgs32" },
    data: defaultData,
  },
  breakpoints: {
    sm: {},
  },
});
