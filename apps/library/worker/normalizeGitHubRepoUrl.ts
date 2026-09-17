import { Effect } from "effect";

import { ScrapeError } from "./ScrapeError";

export const normalizeGitHubRepoUrl = Effect.fn("normalizeGitHubRepoUrl")(function* (url: string) {
  const parsed = yield* Effect.try({
    try: () => new URL(url),
    catch: () =>
      new ScrapeError({
        code: "invalid-scrape-request",
        message: "Repository URL must be valid",
      }),
  });
  const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  const owner = pathSegments[0];
  const repoSegment = pathSegments[1];
  const repo = repoSegment === undefined ? undefined : repoSegment.replace(/\.git$/i, "");
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    pathSegments.length !== 2 ||
    owner === undefined ||
    repo === undefined ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
    !/^[A-Za-z0-9._-]+$/.test(repo)
  ) {
    return yield* new ScrapeError({
      code: "invalid-scrape-request",
      message: "GitHub repository fetches require https://github.com/<owner>/<repo>",
    });
  }
  return {
    canonicalUrl: `https://github.com/${owner.toLowerCase()}/${repo}`,
    owner,
    repo,
  };
});
