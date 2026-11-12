import { Effect } from "effect";

import { normalizeSpotifyUrl } from "../../src/modules/spotify/definition/spotifySchemas";
import { ScrapeError } from "../ScrapeError";

export const resolveSpotifyLink = Effect.fn("resolveSpotifyLink")(function* (props: {
  url: string;
}) {
  const { url } = props;
  if (typeof url !== "string" || url.length > 2_048)
    return yield* new ScrapeError({
      code: "invalid-scrape-request",
      message: "Enter a supported Spotify content link.",
    });
  const direct = normalizeSpotifyUrl(url);
  if (direct !== undefined) return direct;

  const initial = URL.parse(url.trim());
  if (
    initial === null ||
    initial.protocol !== "https:" ||
    initial.hostname !== "spotify.link" ||
    initial.username ||
    initial.password ||
    initial.port ||
    !/^\/[A-Za-z0-9]+\/?$/.test(initial.pathname)
  )
    return yield* new ScrapeError({
      code: "invalid-scrape-request",
      message: "Enter a supported Spotify content link.",
    });

  let current: URL = initial;
  current.hash = "";
  const timeout = AbortSignal.timeout(10_000);
  for (let hops = 0; hops < 4; hops++) {
    const requestUrl: string = current.href;
    const response: Response = yield* Effect.tryPromise({
      try: (interrupt) =>
        fetch(requestUrl, {
          redirect: "manual",
          signal: AbortSignal.any([timeout, interrupt]),
        }),
      catch: () =>
        new ScrapeError({
          code: "scrape-transient-failure",
          message: timeout.aborted
            ? "Spotify link lookup timed out. Try again."
            : "Spotify link lookup failed. Try again.",
          retryable: true,
        }),
    });
    const location = response.headers.get("location");
    const body = response.body;
    if (body !== null)
      yield* Effect.tryPromise({
        try: () => body.cancel(),
        catch: () =>
          new ScrapeError({
            code: "scrape-transient-failure",
            message: "Spotify link lookup failed. Try again.",
            retryable: true,
          }),
      });
    if (![301, 302, 303, 307, 308].includes(response.status) || location === null)
      return yield* new ScrapeError({
        code: response.status === 429 || response.status >= 500 ? "scrape-transient-failure" : "link-unavailable",
        message: "Spotify could not resolve this link. Try again or use a direct Spotify link.",
        retryable: response.status === 429 || response.status >= 500,
      });

    const next: URL | null = location.length <= 2_048 ? URL.parse(location, current) : null;
    if (
      next === null ||
      next.protocol !== "https:" ||
      next.username ||
      next.password ||
      next.port ||
      !["spotify.link", "spotify.app.link", "open.spotify.com"].includes(next.hostname)
    )
      return yield* new ScrapeError({
        code: "invalid-scrape-request",
        message: "Spotify link redirected to an unsupported destination.",
      });

    const resolved = normalizeSpotifyUrl(next.href);
    if (resolved !== undefined) return resolved;
    if (
      !["spotify.link", "spotify.app.link"].includes(next.hostname) ||
      !/^\/[A-Za-z0-9]+\/?$/.test(next.pathname)
    )
      return yield* new ScrapeError({
        code: "invalid-scrape-request",
        message: "Spotify link does not point to supported content.",
      });
    next.hash = "";
    current = next;
  }
  return yield* new ScrapeError({
    code: "link-unavailable",
    message: "Spotify link redirected too many times. Use a direct Spotify link.",
  });
});
