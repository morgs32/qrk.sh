import type { Browser } from "@cloudflare/puppeteer";
import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { TikTokPayloadSchema } from "./schemas";

export const parseTikTokPayload = Effect.fn("parseTikTokPayload")(function* (props: { payload: unknown; username: string }) {
  const payload = yield* Schema.decodeUnknown(TikTokPayloadSchema)(props.payload, { onExcessProperty: "preserve" }).pipe(
    Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "TikTok hydration payload was unsupported" })),
  );
  if (payload.username.toLowerCase() !== props.username.toLowerCase()) {
    return yield* new ScrapeError({ code: "profile-identity-mismatch", message: "TikTok payload did not match the requested profile" });
  }
  return payload;
});

export const scrapeTikTok = Effect.fn("scrapeTikTok")(function* (props: { browser: Browser; url: string }) {
  const page = yield* Effect.tryPromise({
    try: () => props.browser.newPage(),
    catch: cause => new ScrapeError({ code: "scrape-transient-failure", message: `Failed to open TikTok page: ${String(cause)}`, retryable: true }),
  });
  const username = new URL(props.url).pathname.slice(2);
  return yield* Effect.tryPromise({
    try: async () => {
      await page.goto(props.url, { waitUntil: "networkidle2", timeout: 30_000 });
      const json = await page.$eval("script#SIGI_STATE, script#__UNIVERSAL_DATA_FOR_REHYDRATION__", element => element.textContent).catch(() => null);
      if (json === null) {
        throw new ScrapeError({ code: "unsupported-page-shape", message: "TikTok hydration script was empty" });
      }
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        throw new ScrapeError({ code: "unsupported-page-shape", message: "TikTok hydration data was malformed" });
      }
      if (!json.toLowerCase().includes(`"uniqueid":"${username.toLowerCase()}"`)) {
        throw new ScrapeError({ code: "profile-identity-mismatch", message: "TikTok hydration data did not match the requested profile" });
      }
      return await Effect.runPromise(parseTikTokPayload({ payload: { username, data }, username }));
    },
    catch: cause => cause instanceof ScrapeError ? cause : new ScrapeError({ code: "scrape-transient-failure", message: `TikTok navigation failed: ${String(cause)}`, retryable: true }),
  }).pipe(Effect.ensuring(Effect.promise(() => page.close())));
});
