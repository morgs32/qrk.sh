import { Schema } from "effect";

import type {
  IBeaconsScrapePayload,
  IGitHubScrapePayload,
  IInstagramScrapePayload,
  IJsonValue,
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
  data: JsonValueSchema,
}) satisfies Schema.Schema<IInstagramScrapePayload>;

export const GitHubPayloadSchema = Schema.Struct({
  login: Schema.String,
}) satisfies Schema.Schema<IGitHubScrapePayload>;

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
