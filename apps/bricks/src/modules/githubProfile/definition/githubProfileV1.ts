import { defaultSpec } from "./generator/defaultSpec";

import { Schema } from "effect";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../../../definition/layoutComponentMetadata";

import { makeModuleVersion } from "../../../definition/makeModuleVersion";

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
});
