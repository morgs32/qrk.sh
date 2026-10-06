import type { Browser } from "@cloudflare/puppeteer";
import { Effect, Schema } from "effect";

import { ScrapeError } from "../ScrapeError";
import { InstagramPayloadSchema } from "../schemas";

export const parseInstagramPayload = Effect.fn("parseInstagramPayload")(function* (props: {
  payload: unknown;
  username: string;
}) {
  const { payload: inputPayload, username } = props;
  const payload = yield* Schema.decodeUnknownEffect(InstagramPayloadSchema)(inputPayload, {
    onExcessProperty: "ignore",
  }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "Instagram page did not expose supported public profile data",
        }),
    ),
  );
  if (payload.username.toLowerCase() !== username.toLowerCase()) {
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
  const { browser, url } = props;
  const page = yield* Effect.tryPromise({
    try: () => browser.newPage(),
    catch: (cause) =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: `Failed to open Instagram page: ${String(cause)}`,
        retryable: true,
      }),
  });
  const username = new URL(url).pathname.slice(1);
  return yield* Effect.gen(function* () {
    const browserPayloadText = yield* Effect.tryPromise({
      try: async () => {
        const navigationResponse = await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30_000,
        });
        const pagePath = new URL(page.url()).pathname;
        if (
          navigationResponse?.ok() === false ||
          /^\/(?:accounts\/login|challenge)(?:\/|$)/.test(pagePath)
        ) {
          throw new ScrapeError({
            code: "profile-unavailable",
            message: "Instagram profile is not publicly available",
          });
        }
        return await page.evaluate(() => {
          const description =
            document.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
            "";
          const followersMatch = description.match(/^([\d,.]+[KMB]?) Followers/i);
          const profiles: unknown[] = [];
          for (const script of Array.from(
            document.querySelectorAll('script[type="application/json"]'),
          )) {
            let json: unknown;
            try {
              json = JSON.parse(script.textContent ?? "");
            } catch {
              continue;
            }
            const remaining: unknown[] = [json];
            while (remaining.length > 0) {
              const value = remaining.pop();
              if (value === null || typeof value !== "object") continue;
              for (const [key, nested] of Object.entries(value)) {
                if (key === "xig_user_by_username") {
                  profiles.push(nested);
                } else if (nested !== null && typeof nested === "object") {
                  remaining.push(nested);
                }
              }
            }
          }
          return JSON.stringify({
            followersText: followersMatch?.[1] ?? "",
            profiles,
          });
        });
      },
      catch: (cause) =>
        cause instanceof ScrapeError
          ? cause
          : new ScrapeError({
              code: "scrape-transient-failure",
              message: `Instagram navigation failed: ${String(cause)}`,
              retryable: true,
            }),
    });
    const browserPayload = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        Schema.Struct({
          followersText: Schema.NonEmptyString,
          profiles: Schema.Array(
            Schema.Struct({
              username: Schema.optional(Schema.NonEmptyString),
              profile_pic_url: Schema.optional(Schema.NonEmptyString),
              follower_count: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
              is_private: Schema.optional(Schema.Boolean),
              is_unpublished: Schema.optional(Schema.Boolean),
              polaris_ordered_timeline_connection: Schema.optional(
                Schema.NullOr(
                  Schema.Struct({
                    edges: Schema.Array(
                      Schema.Struct({
                        node: Schema.Struct({
                          display_uri: Schema.NullOr(Schema.NonEmptyString),
                        }),
                      }),
                    ),
                  }),
                ),
              ),
            }),
          ),
        }),
      ),
    )(browserPayloadText, { onExcessProperty: "ignore" }).pipe(
      Effect.mapError(
        () =>
          new ScrapeError({
            code: "unsupported-page-shape",
            message: "Instagram page did not expose supported public profile data",
          }),
      ),
    );
    const profile = browserPayload.profiles.find(
      (candidate) =>
        candidate.username !== undefined &&
        candidate.profile_pic_url !== undefined &&
        candidate.follower_count !== undefined,
    );
    if (
      profile === undefined ||
      profile.username === undefined ||
      profile.profile_pic_url === undefined
    ) {
      return yield* new ScrapeError({
        code: "unsupported-page-shape",
        message: "Instagram public profile card data was incomplete",
      });
    }
    if (profile.is_private === true || profile.is_unpublished === true) {
      return yield* new ScrapeError({
        code: "profile-unavailable",
        message: "Instagram profile is not publicly available",
      });
    }
    const timeline = browserPayload.profiles.find(
      (candidate) =>
        candidate.polaris_ordered_timeline_connection !== undefined &&
        candidate.polaris_ordered_timeline_connection !== null,
    )?.polaris_ordered_timeline_connection;
    if (timeline === undefined || timeline === null) {
      return yield* new ScrapeError({
        code: "unsupported-page-shape",
        message: "Instagram page did not expose a supported public profile feed",
      });
    }
    const postImageUrls = timeline.edges
      .flatMap((edge) => {
        const imageUrl = edge.node.display_uri;
        return imageUrl === undefined || imageUrl === null ? [] : [imageUrl];
      })
      .slice(0, 4);
    return yield* parseInstagramPayload({
      payload: {
        username: profile.username,
        profileImageUrl: profile.profile_pic_url,
        followersText: browserPayload.followersText,
        postImageUrls,
      },
      username,
    });
  }).pipe(Effect.ensuring(Effect.promise(() => page.close())));
});
