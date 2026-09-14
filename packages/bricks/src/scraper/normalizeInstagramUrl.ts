import { Effect } from "effect";

import { ScrapeError } from "./ScrapeError";

export const normalizeInstagramUrl = Effect.fn("normalizeInstagramUrl")(function* (url: string) {
  const parsed = yield* Effect.try({
    try: () => new URL(url),
    catch: () => new ScrapeError({ code: "invalid-scrape-request", message: "Scrape URL must be valid" }),
  });
  const pathSegments = parsed.pathname.split("/").filter(segment => segment.length > 0);
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.instagram.com" || pathSegments.length !== 1) {
    return yield* new ScrapeError({ code: "invalid-scrape-request", message: "Instagram scrapes require https://www.instagram.com/<username>" });
  }
  return `https://www.instagram.com/${pathSegments[0]}`;
});
