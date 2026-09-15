import { Effect } from "effect";

import { ScrapeError } from "./ScrapeError";

export const normalizeBeaconsUrl = Effect.fn("normalizeBeaconsUrl")(function* (url: string) {
  const parsed = yield* Effect.try({
    try: () => new URL(url),
    catch: () => new ScrapeError({ code: "invalid-scrape-request", message: "Scrape URL must be valid" }),
  });
  const pathSegments = parsed.pathname.split("/").filter(segment => segment.length > 0);
  if (parsed.protocol !== "https:" || parsed.hostname !== "beacons.ai" || pathSegments.length !== 1) {
    return yield* new ScrapeError({ code: "invalid-scrape-request", message: "Beacons scrapes require https://beacons.ai/<profile>" });
  }
  return `https://beacons.ai/${pathSegments[0]}`;
});
