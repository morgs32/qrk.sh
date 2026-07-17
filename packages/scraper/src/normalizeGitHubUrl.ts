import { Effect } from "effect";

import { ScrapeError } from "./ScrapeError";

export const normalizeGitHubUrl = Effect.fn("normalizeGitHubUrl")(function* (url: string) {
  const parsed = yield* Effect.try({
    try: () => new URL(url),
    catch: () => new ScrapeError({ code: "invalid-scrape-request", message: "Scrape URL must be valid" }),
  });
  const pathSegments = parsed.pathname.split("/").filter(segment => segment.length > 0);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || pathSegments.length !== 1 || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(pathSegments[0])) {
    return yield* new ScrapeError({ code: "invalid-scrape-request", message: "GitHub scrapes require https://github.com/<login>" });
  }
  return `https://github.com/${pathSegments[0].toLowerCase()}`;
});
