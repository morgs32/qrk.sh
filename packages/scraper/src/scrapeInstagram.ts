import type { Browser } from "@cloudflare/puppeteer";
import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { InstagramPayloadSchema } from "./schemas";

export const parseInstagramPayload = Effect.fn("parseInstagramPayload")(function* (props: {
  payload: unknown;
  username: string;
}) {
  const payload = yield* Schema.decodeUnknown(InstagramPayloadSchema)(props.payload, {
    onExcessProperty: "preserve",
  }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "Instagram page did not expose supported public profile data",
        }),
    ),
  );
  if (payload.username.toLowerCase() !== props.username.toLowerCase()) {
    return yield* new ScrapeError({
      code: "profile-identity-mismatch",
      message: "Instagram payload did not match the requested profile",
    });
  }
  return payload;
});

export const scrapeInstagram = Effect.fn("scrapeInstagram")(function* (props: {
  browser: Browser;
  url: string;
}) {
  const page = yield* Effect.tryPromise({
    try: () => props.browser.newPage(),
    catch: (cause) =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: `Failed to open Instagram page: ${String(cause)}`,
        retryable: true,
      }),
  });
  const username = new URL(props.url).pathname.slice(1);
  return yield* Effect.tryPromise({
    try: async () => {
      await page.goto(props.url, { waitUntil: "networkidle2", timeout: 30_000 });
      const title = await page.title();
      if (/login|challenge|private/i.test(title)) {
        throw new ScrapeError({
          code: "profile-unavailable",
          message: "Instagram profile is not publicly available",
        });
      }
      const browserPayloadText = await page.evaluate(async (profileUsername) => {
        const description =
          document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? "";
        const profileImageUrl =
          document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
        const followersMatch = description.match(/^([\d,.]+[KMB]?) Followers/i);
        const timelineResponse = await fetch(
          `/api/v1/feed/user/${profileUsername}/username/?count=12`,
          {
            headers: { "x-ig-app-id": "936619743392459" },
          },
        );
        return JSON.stringify({
          username: profileUsername,
          profileImageUrl,
          followersText: followersMatch?.[1] ?? "",
          timelineText: await timelineResponse.text(),
        });
      }, username);
      const browserPayload = await Effect.runPromise(
        Schema.decodeUnknown(
          Schema.parseJson(
            Schema.Struct({
              username: Schema.String,
              profileImageUrl: Schema.String,
              followersText: Schema.String,
              timelineText: Schema.parseJson(
                Schema.Struct({
                  items: Schema.Array(
                    Schema.Struct({
                      image_versions2: Schema.Struct({
                        candidates: Schema.Array(Schema.Struct({ url: Schema.String })),
                      }),
                    }),
                  ),
                }),
              ),
            }),
          ),
        )(browserPayloadText),
      );
      const payload: unknown = {
        username: browserPayload.username,
        profileImageUrl: browserPayload.profileImageUrl,
        followersText: browserPayload.followersText,
        postImageUrl1:
          browserPayload.timelineText.items[0]?.image_versions2.candidates[0]?.url ?? "",
        postImageUrl2:
          browserPayload.timelineText.items[1]?.image_versions2.candidates[0]?.url ?? "",
        postImageUrl3:
          browserPayload.timelineText.items[2]?.image_versions2.candidates[0]?.url ?? "",
        postImageUrl4:
          browserPayload.timelineText.items[3]?.image_versions2.candidates[0]?.url ?? "",
      };
      if (
        browserPayload.profileImageUrl.length === 0 ||
        browserPayload.followersText.length === 0 ||
        browserPayload.timelineText.items[0]?.image_versions2.candidates[0]?.url === undefined ||
        browserPayload.timelineText.items[1]?.image_versions2.candidates[0]?.url === undefined ||
        browserPayload.timelineText.items[2]?.image_versions2.candidates[0]?.url === undefined ||
        browserPayload.timelineText.items[3]?.image_versions2.candidates[0]?.url === undefined
      ) {
        throw new ScrapeError({
          code: "unsupported-page-shape",
          message: "Instagram public profile card data was incomplete",
        });
      }
      return await Effect.runPromise(parseInstagramPayload({ payload, username }));
    },
    catch: (cause) =>
      cause instanceof ScrapeError
        ? cause
        : new ScrapeError({
            code: "scrape-transient-failure",
            message: `Instagram navigation failed: ${String(cause)}`,
            retryable: true,
          }),
  }).pipe(Effect.ensuring(Effect.promise(() => page.close())));
});
