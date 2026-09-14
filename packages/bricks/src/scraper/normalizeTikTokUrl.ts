import { Effect } from "effect";

import { ScrapeError } from "./ScrapeError";

export const normalizeTikTokUrl = Effect.fn("normalizeTikTokUrl")(function* (url: string) {
  const parsed = yield* Effect.try({
    try: () => new URL(url),
    catch: () => new ScrapeError({ code: "invalid-scrape-request", message: "Scrape URL must be valid" }),
  });
  const pathSegments = parsed.pathname.split("/").filter(segment => segment.length > 0);
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.tiktok.com" || pathSegments.length !== 1 || !pathSegments[0].startsWith("@") || pathSegments[0].length === 1) {
    return yield* new ScrapeError({ code: "invalid-scrape-request", message: "TikTok scrapes require https://www.tiktok.com/@<username>" });
  }
  return `https://www.tiktok.com/${pathSegments[0]}`;
});
