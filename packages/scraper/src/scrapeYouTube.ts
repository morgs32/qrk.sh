import type { Browser } from "@cloudflare/puppeteer";
import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { YouTubePayloadSchema } from "./schemas";

export const parseYouTubePayload = Effect.fn("parseYouTubePayload")(function* (props: { payload: unknown; handle: string }) {
  const payload = yield* Schema.decodeUnknown(YouTubePayloadSchema)(props.payload, { onExcessProperty: "ignore" }).pipe(
    Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "YouTube ytInitialData was unsupported" })),
  );
  if (payload.handle.toLowerCase() !== props.handle.toLowerCase()) {
    return yield* new ScrapeError({ code: "profile-identity-mismatch", message: "YouTube payload did not match the requested channel" });
  }
  return props.payload;
});

export const scrapeYouTube = Effect.fn("scrapeYouTube")(function* (props: { browser: Browser; url: string }) {
  const page = yield* Effect.tryPromise({
    try: () => props.browser.newPage(),
    catch: cause => new ScrapeError({ code: "scrape-transient-failure", message: `Failed to open YouTube page: ${String(cause)}`, retryable: true }),
  });
  const handle = new URL(props.url).pathname.slice(2);
  return yield* Effect.tryPromise({
    try: async () => {
      await page.goto(props.url, { waitUntil: "networkidle2", timeout: 30_000 });
      await page.waitForFunction("typeof ytInitialData !== 'undefined'", { timeout: 15_000 }).catch(() => {
        throw new ScrapeError({ code: "unsupported-page-shape", message: "YouTube ytInitialData was not found" });
      });
      const data: unknown = await page.evaluate("ytInitialData");
      const canonical = await page.$eval("link[rel='canonical']", element => element.getAttribute("href"));
      if (canonical === null || new URL(canonical).pathname.toLowerCase() !== `/@${handle.toLowerCase()}`) {
        throw new ScrapeError({ code: "profile-identity-mismatch", message: "YouTube canonical channel did not match the requested handle" });
      }
      return await Effect.runPromise(parseYouTubePayload({ payload: { handle, data }, handle }));
    },
    catch: cause => cause instanceof ScrapeError ? cause : new ScrapeError({ code: "scrape-transient-failure", message: `YouTube navigation failed: ${String(cause)}`, retryable: true }),
  }).pipe(Effect.ensuring(Effect.promise(() => page.close())));
});
