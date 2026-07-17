import { Effect } from "effect";

import { ScrapeError } from "./ScrapeError";

export const normalizeLinktreeUrl = Effect.fn("normalizeLinktreeUrl")(function* (url: string) {
  const parsed = yield* Effect.try({
    try: () => new URL(url),
    catch: () =>
      new ScrapeError({
        code: "invalid-scrape-request",
        message: "Scrape URL must be a valid URL",
      }),
  });
  const pathSegments = parsed.pathname.split("/").filter(segment => segment.length > 0);

  if (parsed.protocol !== "https:" || parsed.hostname !== "linktr.ee" || pathSegments.length !== 1) {
    return yield* new ScrapeError({
      code: "invalid-scrape-request",
      message: "Linktree scrapes require https://linktr.ee/<profile>",
    });
  }

  return `https://linktr.ee/${pathSegments[0]}`;
});
