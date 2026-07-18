import { Schema } from "effect";

import type {
  IBeaconsScrapePayload,
  IGitHubScrapePayload,
  IInstagramScrapePayload,
  IJsonValue,
  ILinkPreview,
  ILinktreeScrapePayload,
  ITikTokScrapePayload,
  ITruthSocialScrapePayload,
  IYouTubeScrapePayload,
} from "./types";

const JsonValueSchema = Schema.declare((input: unknown): input is IJsonValue => {
  try {
    return JSON.stringify(input) !== undefined;
  } catch {
    return false;
  }
});

export const LinktreePayloadSchema = Schema.Struct({
  props: Schema.Struct({
    pageProps: Schema.Struct({
      account: Schema.Struct({ username: Schema.String }),
    }),
  }),
}) satisfies Schema.Schema<ILinktreeScrapePayload>;

export const BeaconsPayloadSchema = Schema.Struct({
  username: Schema.String,
  source: Schema.Literal("embedded", "rendered"),
  data: JsonValueSchema,
}) satisfies Schema.Schema<IBeaconsScrapePayload>;

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
        level: Schema.Literal(0, 1, 2, 3, 4),
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

export const TikTokPayloadSchema = Schema.Struct({
  username: Schema.String,
  data: JsonValueSchema,
}) satisfies Schema.Schema<ITikTokScrapePayload>;

export const YouTubePayloadSchema = Schema.Struct({
  handle: Schema.String,
  data: JsonValueSchema,
}) satisfies Schema.Schema<IYouTubeScrapePayload>;

export const TruthSocialPayloadSchema = Schema.Struct({
  username: Schema.String,
  acct: Schema.String,
}) satisfies Schema.Schema<ITruthSocialScrapePayload>;
