import { defaultSpec } from "./generator/defaultSpec";

import { Schema } from "effect";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../lib/jsonRender/layoutComponentMetadata";

import { makeModuleVersion } from "../make/makeModuleVersion";

import { avatarAndUsernameComponentMetadata } from "./generator/AvatarAndUsernameComponentMetadata";

import { bioComponentMetadata } from "./generator/BioComponentMetadata";

import { blogComponentMetadata } from "./generator/BlogComponentMetadata";

import { followersComponentMetadata } from "./generator/FollowersComponentMetadata";

import { followingComponentMetadata } from "./generator/FollowingComponentMetadata";

import { locationComponentMetadata } from "./generator/LocationComponentMetadata";

import { publicReposComponentMetadata } from "./generator/PublicReposComponentMetadata";

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
  version: 1,
  variants: {
    default: {
      defaultWidth: 360,
      minWidth: 320,
      defaultHeight: 360,
    },
  },
  defaultSpec,
  hasPlaceholder: true,
  componentMetadata: {
    BrickShell: brickShellComponentMetadata,
    BrickBody: brickBodyComponentMetadata,
    BrickFooter: brickFooterComponentMetadata,
    Column: columnComponentMetadata,
    Row: rowComponentMetadata,
    AvatarAndUsername: avatarAndUsernameComponentMetadata,
    Bio: bioComponentMetadata,
    Location: locationComponentMetadata,
    Blog: blogComponentMetadata,
    Followers: followersComponentMetadata,
    Following: followingComponentMetadata,
    PublicRepos: publicReposComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "https://github.com/octocat" },
    data: defaultData,
  },
});
