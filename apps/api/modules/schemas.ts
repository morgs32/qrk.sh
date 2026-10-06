import { Schema } from "effect";

import type {
  IGitHubRepoPayload,
  IGitHubScrapePayload,
  IInstagramScrapePayload,
  ILinkPreview,
} from "./types";

export const InstagramPayloadSchema = Schema.Struct({
  username: Schema.NonEmptyString,
  profileImageUrl: Schema.NonEmptyString,
  followersText: Schema.NonEmptyString,
  postImageUrls: Schema.Array(Schema.NonEmptyString).check(Schema.isMaxLength(4)),
}) satisfies Schema.Schema<IInstagramScrapePayload>;

export const GitHubPayloadSchema = Schema.Struct({
  login: Schema.String,
  contributions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        date: Schema.String,
        count: Schema.Int,
        level: Schema.Literals([0, 1, 2, 3, 4]),
      }),
    ),
  ),
}) satisfies Schema.Schema<IGitHubScrapePayload>;

export const GitHubRepoPayloadSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  stargazers_count: Schema.Number,
  forks_count: Schema.Number,
  language: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<IGitHubRepoPayload>;

export const LinkPreviewSchema = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  description: Schema.String,
  siteName: Schema.String,
  imageUrl: Schema.String,
  iconUrl: Schema.String,
}) satisfies Schema.Schema<ILinkPreview>;

export const FigmaFilePreviewPayloadSchema = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  thumbnail_url: Schema.optional(Schema.NullOr(Schema.String)),
  thumbnail_width: Schema.optional(Schema.NullOr(Schema.Int)),
  thumbnail_height: Schema.optional(Schema.NullOr(Schema.Int)),
});
