import { Schema } from "effect";

import type { IPageType, IScrapeMessage } from "./types";

export const PageTypeSchema = Schema.Literal(
  "linktree",
  "beacons",
  "instagram",
  "github",
  "tiktok",
  "youtube",
  "truth-social",
) satisfies Schema.Schema<IPageType>;

export const SubmitScrapeSchema = Schema.Struct({
  pageType: PageTypeSchema,
  url: Schema.String,
});

export const ScrapeMessageSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  pageType: PageTypeSchema,
}) satisfies Schema.Schema<IScrapeMessage>;

export const JsonPayloadSchema = Schema.parseJson(Schema.Unknown);

export const LinktreePayloadSchema = Schema.Struct({
  props: Schema.Struct({
    pageProps: Schema.Struct({
      account: Schema.Struct({ username: Schema.String }),
    }),
  }),
});

export const BeaconsPayloadSchema = Schema.Struct({
  username: Schema.String,
  source: Schema.Literal("embedded", "rendered"),
  data: Schema.Unknown,
});

export const InstagramPayloadSchema = Schema.Struct({
  username: Schema.String,
  data: Schema.Unknown,
});

export const TikTokPayloadSchema = Schema.Struct({
  username: Schema.String,
  data: Schema.Unknown,
});

export const YouTubePayloadSchema = Schema.Struct({
  handle: Schema.String,
  data: Schema.Unknown,
});

export const TruthSocialPayloadSchema = Schema.Struct({
  username: Schema.String,
  acct: Schema.String,
});

export const GitHubPayloadSchema = Schema.Struct({
  login: Schema.String,
});

export const GitHubJobReservationSchema = Schema.Struct({
  id: Schema.String,
  created: Schema.Boolean,
});
