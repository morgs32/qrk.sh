import { Schema } from "effect";

import type {
  IGitHubScrapePayload,
  IInstagramScrapePayload,
  ILinkPreview,
} from "./types";

export const InstagramPayloadSchema = Schema.Struct({
  username: Schema.String,
  profileImageUrl: Schema.String,
  followersText: Schema.String,
  postImageUrl1: Schema.String,
  postImageUrl2: Schema.String,
  postImageUrl3: Schema.String,
  postImageUrl4: Schema.String,
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
