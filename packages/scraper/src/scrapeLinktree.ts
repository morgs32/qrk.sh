import type { Browser } from "@cloudflare/puppeteer";
import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { LinktreePayloadSchema } from "./schemas";

export const parseLinktreePayload = Effect.fn("parseLinktreePayload")(function* (props: {
  json: string;
  username: string;
}) {
  const parsed = yield* Effect.try({
    try: (): unknown => JSON.parse(props.json),
    catch: () => new ScrapeError({ code: "unsupported-page-shape", message: "Linktree __NEXT_DATA__ was malformed" }),
  });
  const payload = yield* Schema.decodeUnknown(LinktreePayloadSchema)(parsed, { onExcessProperty: "preserve" }).pipe(
    Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "Linktree __NEXT_DATA__ did not contain an account" })),
  );
  if (payload.props.pageProps.account.username.toLowerCase() !== props.username.toLowerCase()) {
    return yield* new ScrapeError({ code: "profile-identity-mismatch", message: "Linktree payload did not match the requested profile" });
  }
  return payload;
});

export const scrapeLinktree = Effect.fn("scrapeLinktree")(function* (props: { browser: Browser; url: string }) {
  const page = yield* Effect.tryPromise({
    try: () => props.browser.newPage(),
    catch: cause => new ScrapeError({ code: "scrape-transient-failure", message: `Failed to open Linktree page: ${String(cause)}`, retryable: true }),
  });
  const username = new URL(props.url).pathname.slice(1);
  return yield* Effect.tryPromise({
    try: async () => {
      await page.goto(props.url, { waitUntil: "load", timeout: 30_000 });
      const json = await page.$eval("script#__NEXT_DATA__", element => element.textContent).catch(() => null);
      if (json === null) {
        throw new ScrapeError({ code: "unsupported-page-shape", message: "Linktree __NEXT_DATA__ was empty" });
      }
      return await Effect.runPromise(parseLinktreePayload({ json, username }));
    },
    catch: cause => cause instanceof ScrapeError ? cause : new ScrapeError({ code: "scrape-transient-failure", message: `Linktree navigation failed: ${String(cause)}`, retryable: true }),
  }).pipe(Effect.ensuring(Effect.promise(() => page.close())));
});
