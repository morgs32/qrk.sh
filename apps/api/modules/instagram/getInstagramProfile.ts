import { makePublicObjectUrl } from "@qrk.sh/r2-assets";
import { readRpcEnvelope } from "@zerospin/core/utils/readRpcEnvelope";
import { catchZerospinError } from "@zerospin/error";
import { Effect, Schema } from "effect";

import { BackendRepo } from "../../BackendRepo";
import { ScrapeError } from "../ScrapeError";
import { normalizeInstagramUrl } from "./normalizeInstagramUrl";
import { parseInstagramPayload } from "./scrapeInstagram";

export const getInstagramProfile = Effect.fn("getInstagramProfile")(function* (props: {
  url: string;
  request: Request;
  token: string;
  bucket: R2Bucket;
  publicBaseUrl: string;
}) {
  const { url, request, token, bucket, publicBaseUrl } = props;
  const canonicalUrl = yield* normalizeInstagramUrl(url);
  const username = new URL(canonicalUrl).pathname.slice(1);
  if (typeof token !== "string" || token.trim().length === 0) {
    return yield* new ScrapeError({
      code: "provider-configuration-error",
      message: "Instagram provider is not configured",
      retryable: false,
    });
  }
  const signal = AbortSignal.timeout(20_000);
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(
        "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?timeout=20",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ usernames: [username], includeAboutSection: false }),
          signal,
        },
      ),
    catch: () =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: signal.aborted
          ? "Instagram provider request timed out"
          : "Instagram provider request failed",
        retryable: true,
      }),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      return yield* new ScrapeError({
        code: "provider-configuration-error",
        message: "Instagram provider credentials or billing require configuration",
        retryable: false,
      });
    }
    return yield* new ScrapeError({
      code: "scrape-transient-failure",
      message: `Instagram provider request failed with HTTP ${response.status}`,
      retryable: response.status === 429 || response.status >= 500,
    });
  }
  const rawPayload = yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: (cause) =>
      signal.aborted
        ? new ScrapeError({
            code: "scrape-transient-failure",
            message: "Instagram provider request timed out",
            retryable: true,
          })
        : cause instanceof SyntaxError
          ? new ScrapeError({
              code: "unsupported-page-shape",
              message: "Instagram provider returned invalid profile data",
            })
          : new ScrapeError({
              code: "scrape-transient-failure",
              message: "Instagram provider response could not be read",
              retryable: true,
            }),
  });
  const profiles = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Unknown))(rawPayload).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "Instagram provider returned invalid profile data",
        }),
    ),
  );
  const rawProfile = profiles[0];
  if (rawProfile === undefined) {
    return yield* new ScrapeError({
      code: "unsupported-page-shape",
      message: "Instagram provider returned no profile data",
    });
  }
  const identity = yield* Schema.decodeUnknownEffect(
    Schema.Struct({ username: Schema.NonEmptyString, private: Schema.Boolean }),
  )(rawProfile, { onExcessProperty: "ignore" }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "Instagram provider profile identity was incomplete",
        }),
    ),
  );
  if (identity.username.toLowerCase() !== username) {
    return yield* new ScrapeError({
      code: "profile-identity-mismatch",
      message: "Instagram provider returned a different profile",
    });
  }
  if (identity.private) {
    return yield* new ScrapeError({
      code: "profile-unavailable",
      message: "Instagram profile is private",
    });
  }
  const profile = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      followersCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      profilePicUrlHD: Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
      profilePicUrl: Schema.optional(Schema.Unknown),
      latestPosts: Schema.Array(Schema.Unknown),
    }),
  )(rawProfile, { onExcessProperty: "ignore" }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "Instagram provider profile data was incomplete",
        }),
    ),
  );
  const posts = yield* Schema.decodeUnknownEffect(
    Schema.Array(Schema.Struct({ displayUrl: Schema.NonEmptyString })),
  )(profile.latestPosts.slice(0, 4), { onExcessProperty: "ignore" }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "Instagram provider post image data was incomplete",
        }),
    ),
  );
  const scrapedPayload = yield* parseInstagramPayload({
    payload: {
      username: identity.username,
      profileImageUrl: profile.profilePicUrlHD ?? profile.profilePicUrl,
      followersText: new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(profile.followersCount),
      postImageUrls: posts.map((post) => post.displayUrl),
    },
    username,
  });
  const fetchPrefix = `instagram/${username}/${crypto.randomUUID()}`;
  const imageUrls: string[] = [];
  for (const [index, sourceUrl] of [
    scrapedPayload.profileImageUrl,
    ...scrapedPayload.postImageUrls,
  ].entries()) {
    const response = yield* Effect.tryPromise({
      try: () => fetch(sourceUrl),
      catch: (cause) =>
        new ScrapeError({
          code: "file-unavailable",
          message: `Instagram image download failed: ${String(cause)}`,
        }),
    });
    const contentType = response.headers.get("content-type");
    if (
      !response.ok ||
      contentType === null ||
      !/^image\/[a-z0-9.+-]+(?:\s*;.*)?$/i.test(contentType)
    ) {
      return yield* new ScrapeError({
        code: "file-unavailable",
        message: "Instagram image response was unsuccessful or did not contain an image",
      });
    }
    const bytes = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (cause) =>
        new ScrapeError({
          code: "file-unavailable",
          message: `Instagram image could not be read: ${String(cause)}`,
        }),
    });
    if (bytes.byteLength === 0) {
      return yield* new ScrapeError({
        code: "file-unavailable",
        message: "Instagram image response was empty",
      });
    }
    const objectKey = `${fetchPrefix}/${index === 0 ? "avatar" : `post-${index}`}`;
    const storedObject = yield* Effect.tryPromise({
      try: () => bucket.put(objectKey, bytes, { httpMetadata: { contentType } }),
      catch: (cause) =>
        new ScrapeError({
          code: "scrape-persistence-failed",
          message: `Instagram image could not be stored: ${String(cause)}`,
        }),
    });
    if (storedObject === null) {
      return yield* new ScrapeError({
        code: "scrape-persistence-failed",
        message: "Instagram image was not stored",
      });
    }
    imageUrls.push(makePublicObjectUrl({ request, publicBaseUrl, key: objectKey }));
  }
  const payload = yield* parseInstagramPayload({
    payload: {
      username,
      followersText: scrapedPayload.followersText,
      profileImageUrl: imageUrls[0],
      postImageUrls: imageUrls.slice(1),
    },
    username,
  });
  const key = `instagram-profile:${canonicalUrl}`;
  yield* BackendRepo.getRepo({ key: {} }).pipe(
    Effect.flatMap((repo) =>
      Effect.tryPromise({
        try: () => repo.storeResponse({ key, payload }),
        catch: catchZerospinError({ code: "backend-response-retention-failed" }),
      }),
    ),
    Effect.flatMap(readRpcEnvelope),
    Effect.catch((error) =>
      Effect.sync(() => {
        console.error(JSON.stringify({ event: "backend-response-retention-failed", key, error }));
      }),
    ),
  );
  return payload;
});
