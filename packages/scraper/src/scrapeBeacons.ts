import type { Browser } from "@cloudflare/puppeteer";
import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { BeaconsPayloadSchema } from "./schemas";

export const parseBeaconsPayload = Effect.fn("parseBeaconsPayload")(function* (props: { payload: unknown; username: string }) {
  const payload = yield* Schema.decodeUnknown(BeaconsPayloadSchema)(props.payload, { onExcessProperty: "preserve" }).pipe(
    Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "Beacons page did not expose supported profile data" })),
  );
  if (payload.username.toLowerCase() !== props.username.toLowerCase()) {
    return yield* new ScrapeError({ code: "profile-identity-mismatch", message: "Beacons payload did not match the requested profile" });
  }
  return payload;
});

export const scrapeBeacons = Effect.fn("scrapeBeacons")(function* (props: { browser: Browser; url: string }) {
  const page = yield* Effect.tryPromise({
    try: () => props.browser.newPage(),
    catch: cause => new ScrapeError({ code: "scrape-transient-failure", message: `Failed to open Beacons page: ${String(cause)}`, retryable: true }),
  });
  const username = new URL(props.url).pathname.slice(1);
  return yield* Effect.tryPromise({
    try: async () => {
      await page.goto(props.url, { waitUntil: "networkidle2", timeout: 30_000 });
      const embedded = await page.$eval("script#__NEXT_DATA__", element => element.textContent).catch(() => null);
      let payload: unknown;
      if (embedded === null) {
        payload = { username, source: "rendered", data: await page.evaluate(() => ({ title: document.title, text: document.body.innerText })) };
      } else {
        let data: unknown;
        try {
          data = JSON.parse(embedded);
        } catch {
          throw new ScrapeError({ code: "unsupported-page-shape", message: "Beacons embedded state was malformed" });
        }
        payload = { username, source: "embedded", data };
      }
      return await Effect.runPromise(parseBeaconsPayload({ payload, username }));
    },
    catch: cause => cause instanceof ScrapeError ? cause : new ScrapeError({ code: "scrape-transient-failure", message: `Beacons navigation failed: ${String(cause)}`, retryable: true }),
  }).pipe(Effect.ensuring(Effect.promise(() => page.close())));
});
