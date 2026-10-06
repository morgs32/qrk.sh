import { makePublicObjectUrl } from "@qrk.sh/r2-assets";
import { readRpcEnvelope } from "@zerospin/core/utils/readRpcEnvelope";
import { catchZerospinError } from "@zerospin/error";
import { Effect } from "effect";

import { BackendRepo } from "../../BackendRepo";
import { ScrapeError } from "../ScrapeError";
import type { BrowserHost } from "./BrowserHost";
import { normalizeInstagramUrl } from "./normalizeInstagramUrl";
import { parseInstagramPayload } from "./scrapeInstagram";

export const getInstagramProfile = Effect.fn("getInstagramProfile")(function* (props: {
  url: string;
  request: Request;
  browserHost: DurableObjectNamespace<BrowserHost>;
  bucket: R2Bucket;
  publicBaseUrl: string;
}) {
  const { url, request, browserHost, bucket, publicBaseUrl } = props;
  const canonicalUrl = yield* normalizeInstagramUrl(url);
  const username = new URL(canonicalUrl).pathname.slice(1);
  const scrapeResult = yield* Effect.tryPromise({
    try: async () => await browserHost.getByName("global").scrapeInstagram(canonicalUrl),
    catch: (cause) =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: `Instagram scrape failed: ${String(cause)}`,
        retryable: true,
      }),
  });
  if (scrapeResult._tag === "Left") {
    return yield* new ScrapeError(scrapeResult.left);
  }
  const rawPayload = yield* Effect.try({
    try: (): unknown => JSON.parse(scrapeResult.right),
    catch: () =>
      new ScrapeError({
        code: "unsupported-page-shape",
        message: "BrowserHost returned an invalid Instagram payload",
      }),
  });
  const scrapedPayload = yield* parseInstagramPayload({ payload: rawPayload, username });
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
