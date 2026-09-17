import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { GitHubRepoPayloadSchema } from "./schemas";

export const fetchGitHubRepo = Effect.fn("fetchGitHubRepo")(function* (props: {
  owner: string;
  repo: string;
  token: string;
}) {
  if (typeof props.token !== "string" || props.token.trim() === "") {
    return yield* new ScrapeError({
      code: "provider-configuration-error",
      message: "GITHUB_TOKEN is not configured",
    });
  }

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(
        `https://api.github.com/repos/${encodeURIComponent(props.owner)}/${encodeURIComponent(props.repo)}`,
        {
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${props.token}`,
            "user-agent": "qrk.sh-scraper",
            "x-github-api-version": "2026-03-10",
          },
        },
      ),
    catch: (cause) =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: `GitHub repository request failed: ${String(cause)}`,
        retryable: true,
      }),
  });

  if (response.status === 404) {
    return yield* new ScrapeError({
      code: "repo-unavailable",
      message: "GitHub repository was not found",
    });
  }
  if (
    response.status === 429 ||
    response.status >= 500 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    return yield* new ScrapeError({
      code: "scrape-transient-failure",
      message: `GitHub returned HTTP ${response.status}`,
      retryable: true,
    });
  }
  if (!response.ok) {
    return yield* new ScrapeError({
      code: "repo-unavailable",
      message: `GitHub authentication or access failed with HTTP ${response.status}`,
    });
  }

  const payload = yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: () =>
      new ScrapeError({
        code: "unsupported-page-shape",
        message: "GitHub returned malformed JSON",
      }),
  });

  return yield* Schema.decodeUnknownEffect(GitHubRepoPayloadSchema)(payload, {
    onExcessProperty: "ignore",
  }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "GitHub repository response was unsupported",
        }),
    ),
  );
});
