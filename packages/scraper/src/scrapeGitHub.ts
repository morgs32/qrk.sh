import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { GitHubPayloadSchema } from "./schemas";

export const parseGitHubPayload = Effect.fn("parseGitHubPayload")(function* (props: {
  payload: unknown;
  login: string;
}) {
  const payload = yield* Schema.decodeUnknown(GitHubPayloadSchema)(props.payload, {
    onExcessProperty: "preserve",
  }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "GitHub user response was unsupported",
        }),
    ),
  );
  if (payload.login.toLowerCase() !== props.login.toLowerCase()) {
    return yield* new ScrapeError({
      code: "profile-identity-mismatch",
      message: "GitHub account did not match the requested profile",
    });
  }
  return payload;
});

export const scrapeGitHub = Effect.fn("scrapeGitHub")(function* (props: {
  url: string;
  token: string;
}) {
  const login = new URL(props.url).pathname.slice(1);
  const profileResponse = yield* Effect.tryPromise({
    try: () =>
      fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${props.token}`,
          "user-agent": "qrk.sh-scraper",
          "x-github-api-version": "2026-03-10",
        },
      }),
    catch: (cause) =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: `GitHub request failed: ${String(cause)}`,
        retryable: true,
      }),
  });
  if (profileResponse.status === 404) {
    return yield* new ScrapeError({
      code: "profile-unavailable",
      message: "GitHub profile was not found",
    });
  }
  if (
    profileResponse.status === 429 ||
    profileResponse.status >= 500 ||
    (profileResponse.status === 403 && profileResponse.headers.get("x-ratelimit-remaining") === "0")
  ) {
    return yield* new ScrapeError({
      code: "scrape-transient-failure",
      message: `GitHub returned HTTP ${profileResponse.status}`,
      retryable: true,
    });
  }
  if (!profileResponse.ok) {
    return yield* new ScrapeError({
      code: "profile-unavailable",
      message: `GitHub authentication or access failed with HTTP ${profileResponse.status}`,
    });
  }
  const profilePayload = yield* Effect.tryPromise({
    try: (): Promise<unknown> => profileResponse.json(),
    catch: () =>
      new ScrapeError({
        code: "unsupported-page-shape",
        message: "GitHub returned malformed JSON",
      }),
  });
  JSON.stringify(profilePayload);
  const profile = yield* parseGitHubPayload({ payload: profilePayload, login });

  const contributionRangeEnd = new Date();
  const contributionRangeStart = new Date(contributionRangeEnd);
  contributionRangeStart.setUTCFullYear(contributionRangeStart.getUTCFullYear() - 1);

  const contributionsResponse = yield* Effect.tryPromise({
    try: () =>
      fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${props.token}`,
          "content-type": "application/json",
          "user-agent": "qrk.sh-scraper",
          "x-github-api-version": "2026-03-10",
        },
        body: JSON.stringify({
          query: `query GitHubProfileContributions($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}`,
          variables: {
            login,
            from: contributionRangeStart.toISOString(),
            to: contributionRangeEnd.toISOString(),
          },
        }),
      }),
    catch: (cause) =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: `GitHub contributions request failed: ${String(cause)}`,
        retryable: true,
      }),
  });
  if (
    contributionsResponse.status === 429 ||
    contributionsResponse.status >= 500 ||
    (contributionsResponse.status === 403 &&
      contributionsResponse.headers.get("x-ratelimit-remaining") === "0")
  ) {
    return yield* new ScrapeError({
      code: "scrape-transient-failure",
      message: `GitHub contributions returned HTTP ${contributionsResponse.status}`,
      retryable: true,
    });
  }
  if (!contributionsResponse.ok) {
    return yield* new ScrapeError({
      code: "profile-unavailable",
      message: `GitHub contributions access failed with HTTP ${contributionsResponse.status}`,
    });
  }
  const contributionsPayload = yield* Effect.tryPromise({
    try: (): Promise<unknown> => contributionsResponse.json(),
    catch: () =>
      new ScrapeError({
        code: "unsupported-page-shape",
        message: "GitHub contributions returned malformed JSON",
      }),
  });
  const decodedContributions = yield* Schema.decodeUnknown(
    Schema.Struct({
      data: Schema.Struct({
        user: Schema.Struct({
          login: Schema.String,
          contributionsCollection: Schema.Struct({
            contributionCalendar: Schema.Struct({
              weeks: Schema.Array(
                Schema.Struct({
                  contributionDays: Schema.Array(
                    Schema.Struct({
                      date: Schema.String,
                      contributionCount: Schema.Int,
                      contributionLevel: Schema.Literal(
                        "NONE",
                        "FIRST_QUARTILE",
                        "SECOND_QUARTILE",
                        "THIRD_QUARTILE",
                        "FOURTH_QUARTILE",
                      ),
                    }),
                  ),
                }),
              ),
            }),
          }),
        }),
      }),
    }),
  )(contributionsPayload).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "unsupported-page-shape",
          message: "GitHub contributions response was unsupported",
        }),
    ),
  );
  if (decodedContributions.data.user.login.toLowerCase() !== login.toLowerCase()) {
    return yield* new ScrapeError({
      code: "profile-identity-mismatch",
      message: "GitHub contributions did not match the requested profile",
    });
  }

  const contributions: Array<{ date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }> = [];
  for (const week of decodedContributions.data.user.contributionsCollection.contributionCalendar
    .weeks) {
    for (const day of week.contributionDays) {
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (day.contributionLevel === "FIRST_QUARTILE") level = 1;
      if (day.contributionLevel === "SECOND_QUARTILE") level = 2;
      if (day.contributionLevel === "THIRD_QUARTILE") level = 3;
      if (day.contributionLevel === "FOURTH_QUARTILE") level = 4;
      contributions.push({
        date: day.date,
        count: day.contributionCount,
        level,
      });
    }
  }

  return yield* parseGitHubPayload({ payload: { ...profile, contributions }, login });
});
