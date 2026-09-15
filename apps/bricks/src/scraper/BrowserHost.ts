import puppeteer, { type Browser } from "@cloudflare/puppeteer";
import { DurableObject } from "cloudflare:workers";
import { Effect } from "effect";

import { encodeRpc } from "./encodeRpc";
import { scrapeBeacons } from "./scrapeBeacons";
import { scrapeInstagram } from "./scrapeInstagram";
import { scrapeLinktree } from "./scrapeLinktree";
import { scrapeTikTok } from "./scrapeTikTok";
import { scrapeYouTube } from "./scrapeYouTube";
import type { IRpcEither, IScraperEnv } from "./types";

export class BrowserHost extends DurableObject<IScraperEnv> {
  #browser: Browser | undefined;
  #browserLaunchPromise: Promise<Browser> | undefined;

  async scrapeLinktree(url: string): Promise<IRpcEither<string>> {
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
            message: `Browser launch failed for Linktree: ${String(cause)}`,
            retryable: true,
          },
        };
      }
    }
    const result = await Effect.runPromise(scrapeLinktree({ browser, url }).pipe(encodeRpc));
    if (result._tag === "Left") return result;
    return { _tag: "Right", right: JSON.stringify(result.right) };
  }

  async scrapeBeacons(url: string): Promise<IRpcEither<string>> {
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
            message: `Browser launch failed for Beacons: ${String(cause)}`,
            retryable: true,
          },
        };
      }
    }
    const result = await Effect.runPromise(scrapeBeacons({ browser, url }).pipe(encodeRpc));
    if (result._tag === "Left") return result;
    return { _tag: "Right", right: JSON.stringify(result.right) };
  }

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

  async scrapeTikTok(url: string): Promise<IRpcEither<string>> {
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
            message: `Browser launch failed for TikTok: ${String(cause)}`,
            retryable: true,
          },
        };
      }
    }
    const result = await Effect.runPromise(scrapeTikTok({ browser, url }).pipe(encodeRpc));
    if (result._tag === "Left") return result;
    return { _tag: "Right", right: JSON.stringify(result.right) };
  }

  async scrapeYouTube(url: string): Promise<IRpcEither<string>> {
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
            message: `Browser launch failed for YouTube: ${String(cause)}`,
            retryable: true,
          },
        };
      }
    }
    const result = await Effect.runPromise(scrapeYouTube({ browser, url }).pipe(encodeRpc));
    if (result._tag === "Left") return result;
    return { _tag: "Right", right: JSON.stringify(result.right) };
  }
}
