import type { Browser } from "@cloudflare/puppeteer";
import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { InstagramPayloadSchema } from "./schemas";

export const parseInstagramPayload = Effect.fn("parseInstagramPayload")(function* (props: { payload: unknown; username: string }) {
  const payload = yield* Schema.decodeUnknown(InstagramPayloadSchema)(props.payload, { onExcessProperty: "preserve" }).pipe(
    Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "Instagram page did not expose supported public profile data" })),
  );
  if (payload.username.toLowerCase() !== props.username.toLowerCase()) {
    return yield* new ScrapeError({ code: "profile-identity-mismatch", message: "Instagram payload did not match the requested profile" });
  }
  return payload;
});

export const scrapeInstagram = Effect.fn("scrapeInstagram")(function* (props: { browser: Browser; url: string }) {
  const page = yield* Effect.tryPromise({
    try: () => props.browser.newPage(),
    catch: cause => new ScrapeError({ code: "scrape-transient-failure", message: `Failed to open Instagram page: ${String(cause)}`, retryable: true }),
  });
  const username = new URL(props.url).pathname.slice(1);
  return yield* Effect.tryPromise({
    try: async () => {
      await page.goto(props.url, { waitUntil: "networkidle2", timeout: 30_000 });
      const title = await page.title();
      if (/login|challenge|private/i.test(title)) {
        throw new ScrapeError({ code: "profile-unavailable", message: "Instagram profile is not publicly available" });
      }
      const scripts = await page.$$eval("script[type='application/json']", elements => elements.map(element => element.textContent).filter(text => text !== null));
      const matching = scripts.find(text => text.toLowerCase().includes(`"username":"${username.toLowerCase()}"`));
      if (matching === undefined) {
        throw new ScrapeError({ code: "unsupported-page-shape", message: "Instagram public profile state was not found" });
      }
      let data: unknown;
      try {
        data = JSON.parse(matching);
      } catch {
        throw new ScrapeError({ code: "unsupported-page-shape", message: "Instagram public profile state was malformed" });
      }
      const payload: unknown = { username, data };
      return await Effect.runPromise(parseInstagramPayload({ payload, username }));
    },
    catch: cause => cause instanceof ScrapeError ? cause : new ScrapeError({ code: "scrape-transient-failure", message: `Instagram navigation failed: ${String(cause)}`, retryable: true }),
  }).pipe(Effect.ensuring(Effect.promise(() => page.close())));
});
