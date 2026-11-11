import { Effect } from "effect";

import { ScrapeError } from "../ScrapeError";

export const normalizeInstagramUrl = Effect.fn("normalizeInstagramUrl")(function* (url: string) {
  const parsed = yield* Effect.try({
    try: () => new URL(url.trim()),
    catch: () =>
      new ScrapeError({ code: "invalid-scrape-request", message: "Scrape URL must be valid" }),
  });
  const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  const username = pathSegments[0];
  if (
    parsed.protocol !== "https:" ||
    (parsed.hostname !== "www.instagram.com" && parsed.hostname !== "instagram.com") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.port.length > 0 ||
    pathSegments.length !== 1 ||
    username === undefined ||
    !/^[a-zA-Z0-9._]{1,30}$/.test(username)
  ) {
    return yield* new ScrapeError({
      code: "invalid-scrape-request",
      message: "Instagram scrapes require https://www.instagram.com/<username>",
    });
  }
  return `https://www.instagram.com/${username.toLowerCase()}`;
});
