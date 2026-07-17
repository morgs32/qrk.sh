import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { GitHubPayloadSchema } from "./schemas";

export const parseGitHubPayload = Effect.fn("parseGitHubPayload")(function* (props: { payload: unknown; login: string }) {
  const payload = yield* Schema.decodeUnknown(GitHubPayloadSchema)(props.payload, { onExcessProperty: "ignore" }).pipe(
    Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "GitHub user response was unsupported" })),
  );
  if (payload.login.toLowerCase() !== props.login.toLowerCase()) {
    return yield* new ScrapeError({ code: "profile-identity-mismatch", message: "GitHub account did not match the requested profile" });
  }
  return props.payload;
});

export const scrapeGitHub = Effect.fn("scrapeGitHub")(function* (props: { url: string; token: string }) {
  const login = new URL(props.url).pathname.slice(1);
  const response = yield* Effect.tryPromise({
    try: () => fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${props.token}`,
        "user-agent": "qrk.sh-scraper",
        "x-github-api-version": "2026-03-10",
      },
    }),
    catch: cause => new ScrapeError({ code: "scrape-transient-failure", message: `GitHub request failed: ${String(cause)}`, retryable: true }),
  });
  if (response.status === 404) {
    return yield* new ScrapeError({ code: "profile-unavailable", message: "GitHub profile was not found" });
  }
  if (response.status === 429 || response.status >= 500 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
    return yield* new ScrapeError({ code: "scrape-transient-failure", message: `GitHub returned HTTP ${response.status}`, retryable: true });
  }
  if (!response.ok) {
    return yield* new ScrapeError({ code: "profile-unavailable", message: `GitHub authentication or access failed with HTTP ${response.status}` });
  }
  const payload = yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: () => new ScrapeError({ code: "unsupported-page-shape", message: "GitHub returned malformed JSON" }),
  });
  JSON.stringify(payload);
  return yield* parseGitHubPayload({ payload, login });
});
