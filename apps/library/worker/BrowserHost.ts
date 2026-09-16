import puppeteer, { type Browser } from "@cloudflare/puppeteer";
import { DurableObject } from "cloudflare:workers";
import { Effect } from "effect";

import { encodeRpc } from "./encodeRpc";
import { scrapeInstagram } from "./scrapeInstagram";
import type { IRpcEither, IScraperEnv } from "./types";

export class BrowserHost extends DurableObject<IScraperEnv> {
  #browser: Browser | undefined;
  #browserLaunchPromise: Promise<Browser> | undefined;

  async scrapeInstagram(url: string): Promise<IRpcEither<string>> {
    let browser = this.#browser;
    if (browser !== undefined && !browser.connected) {
      this.#browser = undefined;
      browser = undefined;
    }
    if (browser === undefined) {
      if (this.#browserLaunchPromise === undefined) {
        this.#browserLaunchPromise = puppeteer.launch(this.env.BROWSER).then(launchedBrowser => {
          this.#browser = launchedBrowser;
          launchedBrowser.on("disconnected", () => {
            if (this.#browser === launchedBrowser) {
              this.#browser = undefined;
            }
          });
          return launchedBrowser;
        }).finally(() => {
          this.#browserLaunchPromise = undefined;
        });
      }
      try {
        browser = await this.#browserLaunchPromise;
      } catch (cause) {
        return {
          _tag: "Left",
          left: {
            code: "scrape-transient-failure",
            message: `Browser launch failed for Instagram: ${String(cause)}`,
            retryable: true,
          },
        };
      }
    }
    const result = await Effect.runPromise(scrapeInstagram({ browser, url }).pipe(encodeRpc));
    if (result._tag === "Left") return result;
    return { _tag: "Right", right: JSON.stringify(result.right) };
  }
}
