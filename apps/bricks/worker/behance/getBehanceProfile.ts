import { Effect, Result, Schema } from "effect";

import {
  behanceProjectSchema,
  normalizeBehanceProfile,
} from "../../src/modules/behance/definition/behanceSchemas";
import { ScrapeError } from "../ScrapeError";

const personSchema = Schema.Struct({
  type: Schema.Literal("person"),
  username: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
});

const projectSchema = Schema.Struct({
  type: Schema.Literal("project"),
  id: Schema.Int,
  title: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
  coverUrl: Schema.NonEmptyString,
  ownerUsername: Schema.optional(Schema.String),
  owners: Schema.optional(Schema.Array(Schema.Struct({ username: Schema.String }))),
});

export const getBehanceProfile = Effect.fn("getBehanceProfile")(function* (props: {
  url: string;
  token: string;
}) {
  const { url, token } = props;
  const canonical = normalizeBehanceProfile(url);
  if (canonical === undefined)
    return yield* new ScrapeError({
      code: "invalid-scrape-request",
      message: "Enter a public Behance profile URL.",
    });
  if (!token?.trim())
    return yield* new ScrapeError({
      code: "provider-configuration-error",
      message: "Behance import is unavailable.",
    });

  const signal = AbortSignal.timeout(20_000);
  const response = yield* Effect.tryPromise({
    try: (interrupt) =>
      fetch(
        "https://api.apify.com/v2/acts/tortuga~behance-scraper/run-sync-get-dataset-items?timeout=20&maxItems=13&maxTotalChargeUsd=0.25",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            startUrls: [{ url: canonical }],
            includeProfileProjects: true,
            includeDetails: false,
            maxItemsPerSource: 12,
            maxItems: 13,
          }),
          signal: AbortSignal.any([signal, interrupt]),
        },
      ),
    catch: () =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: signal.aborted
          ? "Behance import timed out. Try again."
          : "Behance import failed. Try again.",
        retryable: true,
      }),
  });
  if (!response.ok) {
    const configurationError = [401, 402, 403].includes(response.status);
    return yield* new ScrapeError({
      code: configurationError ? "provider-configuration-error" : "scrape-transient-failure",
      message: configurationError
        ? "Behance import is unavailable."
        : "Behance import failed. Try again.",
      retryable: !configurationError,
    });
  }

  const rows = yield* Effect.tryPromise({
    try: async () => Schema.decodeUnknownSync(Schema.Array(Schema.Unknown))(await response.json()),
    catch: () =>
      new ScrapeError({
        code: signal.aborted ? "scrape-transient-failure" : "unsupported-page-shape",
        message: signal.aborted
          ? "Behance import timed out. Try again."
          : "Behance returned unreadable profile data.",
      }),
  });

  const profiles = rows.flatMap((row) => {
    const result = Schema.decodeUnknownResult(personSchema)(row);
    return Result.isSuccess(result) ? [result.success] : [];
  });
  const username = new URL(canonical).pathname.slice(1);
  const profile = profiles.find(
    (entry) =>
      entry.username.toLowerCase() === username && normalizeBehanceProfile(entry.url) === canonical,
  );
  if (profile === undefined)
    return yield* new ScrapeError({
      code: profiles.length === 0 ? "profile-unavailable" : "profile-identity-mismatch",
      message: "Behance did not return the requested public profile.",
    });

  const projects = new Map<string, typeof behanceProjectSchema.Type>();
  for (const row of rows) {
    const result = Schema.decodeUnknownResult(projectSchema)(row);
    if (Result.isFailure(result)) continue;
    const { id, title, url: projectUrl, coverUrl, ownerUsername, owners } = result.success;
    if (
      ![ownerUsername, ...(owners ?? []).map((owner) => owner.username)].some(
        (owner) => owner?.toLowerCase() === username,
      )
    )
      continue;
    const parsed = URL.parse(projectUrl);
    if (
      parsed === null ||
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !["behance.net", "www.behance.net"].includes(parsed.hostname)
    )
      continue;
    const project = Schema.decodeUnknownResult(behanceProjectSchema)({
      id: String(id),
      title: title.trim(),
      url: `https://www.behance.net${parsed.pathname.replace(/\/$/, "")}`,
      coverUrl,
    });
    if (Result.isSuccess(project) && !projects.has(project.success.id)) {
      projects.set(project.success.id, project.success);
      if (projects.size === 12) break;
    }
  }

  return { url: canonical, displayName: profile.displayName, projects: [...projects.values()] };
});
