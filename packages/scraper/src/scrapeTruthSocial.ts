import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { TruthSocialPayloadSchema } from "./schemas";

export const parseTruthSocialPayload = Effect.fn("parseTruthSocialPayload")(function* (props: { payload: unknown; username: string }) {
  const payload = yield* Schema.decodeUnknown(TruthSocialPayloadSchema)(props.payload, { onExcessProperty: "ignore" }).pipe(
    Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "Truth Social account response was unsupported" })),
  );
  if (payload.username.toLowerCase() !== props.username.toLowerCase()) {
    return yield* new ScrapeError({ code: "profile-identity-mismatch", message: "Truth Social account did not match the requested profile" });
  }
  return props.payload;
});

export const scrapeTruthSocial = Effect.fn("scrapeTruthSocial")(function* (props: { url: string }) {
  const username = new URL(props.url).pathname.slice(2);
  const response = yield* Effect.tryPromise({
    try: () => fetch(`https://truthsocial.com/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`, { headers: { accept: "application/json" } }),
    catch: cause => new ScrapeError({ code: "scrape-transient-failure", message: `Truth Social request failed: ${String(cause)}`, retryable: true }),
  });
  if (response.status === 404) {
    return yield* new ScrapeError({ code: "profile-unavailable", message: "Truth Social profile was not found" });
  }
  if (response.status === 429 || response.status >= 500) {
    return yield* new ScrapeError({ code: "scrape-transient-failure", message: `Truth Social returned HTTP ${response.status}`, retryable: true });
  }
  if (!response.ok) {
    return yield* new ScrapeError({ code: "profile-unavailable", message: `Truth Social returned HTTP ${response.status}` });
  }
  const payload = yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: () => new ScrapeError({ code: "unsupported-page-shape", message: "Truth Social returned malformed JSON" }),
  });
  return yield* parseTruthSocialPayload({ payload, username });
});
