import puppeteer, { type Browser } from "@cloudflare/puppeteer";
import { newWorkersRpcResponse } from "capnweb";
import { Either, Schema } from "effect";

import { ScraperApi } from "./ScraperApi";
import { ScrapeError } from "./ScrapeError";
import { ScraperRepo } from "./ScraperRepo";
import { ScrapeMessageSchema } from "./schemas";
import { scrapeBeacons } from "./scrapeBeacons";
import { scrapeInstagram } from "./scrapeInstagram";
import { scrapeLinktree } from "./scrapeLinktree";
import { scrapeTikTok } from "./scrapeTikTok";
import { scrapeTruthSocial } from "./scrapeTruthSocial";
import { scrapeYouTube } from "./scrapeYouTube";
import type { IPageType, IScrapeMessage, IScraperEnv } from "./types";
import { Effect } from "effect";

export { ScraperRepo };

const GLOBAL_SCRAPER_REPO_NAME = "global";

const processFailure = async (props: {
  env: IScraperEnv;
  message: Message<IScrapeMessage>;
  attemptCount: number;
  error: unknown;
}): Promise<void> => {
  const repo = props.env.SCRAPER_REPO.getByName(GLOBAL_SCRAPER_REPO_NAME);
  const message = props.error instanceof Error ? props.error.message : String(props.error);
  const retryable = props.error instanceof ScrapeError && props.error.retryable === true;
  if (retryable && props.attemptCount < 3) {
    await repo.recordRetry({ id: props.message.body.id, error: message });
    props.message.retry();
    return;
  }
  await repo.failJob({ id: props.message.body.id, error: message });
  props.message.ack();
};

const processBrowserMessage = async (props: {
  browser: Browser;
  env: IScraperEnv;
  expectedPageType: Exclude<IPageType, "truth-social">;
  message: Message<IScrapeMessage>;
}): Promise<void> => {
  const decoded = Schema.decodeUnknownSync(ScrapeMessageSchema)(props.message.body, { onExcessProperty: "error" });
  const repo = props.env.SCRAPER_REPO.getByName(GLOBAL_SCRAPER_REPO_NAME);
  const attemptCount = await repo.startAttempt(decoded.id);
  if (decoded.pageType !== props.expectedPageType) {
    await processFailure({ env: props.env, message: props.message, attemptCount, error: new ScrapeError({ code: "queue-page-type-mismatch", message: `${decoded.pageType} message was delivered to ${props.expectedPageType} Queue` }) });
    return;
  }
  try {
    let payload: unknown;
    if (props.expectedPageType === "linktree") {
      const result = await Effect.runPromise(scrapeLinktree({ browser: props.browser, url: decoded.url }).pipe(Effect.either));
      if (Either.isLeft(result)) throw result.left;
      payload = result.right;
    } else if (props.expectedPageType === "beacons") {
      const result = await Effect.runPromise(scrapeBeacons({ browser: props.browser, url: decoded.url }).pipe(Effect.either));
      if (Either.isLeft(result)) throw result.left;
      payload = result.right;
    } else if (props.expectedPageType === "instagram") {
      const result = await Effect.runPromise(scrapeInstagram({ browser: props.browser, url: decoded.url }).pipe(Effect.either));
      if (Either.isLeft(result)) throw result.left;
      payload = result.right;
    } else if (props.expectedPageType === "tiktok") {
      const result = await Effect.runPromise(scrapeTikTok({ browser: props.browser, url: decoded.url }).pipe(Effect.either));
      if (Either.isLeft(result)) throw result.left;
      payload = result.right;
    } else {
      const result = await Effect.runPromise(scrapeYouTube({ browser: props.browser, url: decoded.url }).pipe(Effect.either));
      if (Either.isLeft(result)) throw result.left;
      payload = result.right;
    }
    JSON.stringify(payload);
    await repo.completeJob({ id: decoded.id, payload });
    props.message.ack();
  } catch (error) {
    await processFailure({ env: props.env, message: props.message, attemptCount, error });
  }
};

const processBrowserBatch = async (props: {
  batch: MessageBatch<IScrapeMessage>;
  env: IScraperEnv;
  expectedPageType: Exclude<IPageType, "truth-social">;
}): Promise<void> => {
  let browser: Browser;
  try {
    browser = await puppeteer.launch(props.env.BROWSER);
  } catch (error) {
    for (const message of props.batch.messages) {
      const attemptCount = await props.env.SCRAPER_REPO.getByName(GLOBAL_SCRAPER_REPO_NAME).startAttempt(message.body.id);
      await processFailure({ env: props.env, message, attemptCount, error: new ScrapeError({ code: "scrape-transient-failure", message: `Browser launch failed: ${String(error)}`, retryable: true }) });
    }
    return;
  }
  try {
    for (const message of props.batch.messages) {
      await processBrowserMessage({ browser, env: props.env, expectedPageType: props.expectedPageType, message });
    }
  } finally {
    await browser.close();
  }
};

const processTruthSocialBatch = async (batch: MessageBatch<IScrapeMessage>, env: IScraperEnv): Promise<void> => {
  for (const message of batch.messages) {
    const decoded = Schema.decodeUnknownSync(ScrapeMessageSchema)(message.body, { onExcessProperty: "error" });
    const repo = env.SCRAPER_REPO.getByName(GLOBAL_SCRAPER_REPO_NAME);
    const attemptCount = await repo.startAttempt(decoded.id);
    if (decoded.pageType !== "truth-social") {
      await processFailure({ env, message, attemptCount, error: new ScrapeError({ code: "queue-page-type-mismatch", message: `${decoded.pageType} message was delivered to truth-social Queue` }) });
      continue;
    }
    try {
      const result = await Effect.runPromise(scrapeTruthSocial({ url: decoded.url }).pipe(Effect.either));
      if (Either.isLeft(result)) throw result.left;
      const payload = result.right;
      JSON.stringify(payload);
      await repo.completeJob({ id: decoded.id, payload });
      message.ack();
    } catch (error) {
      await processFailure({ env, message, attemptCount, error });
    }
  }
};

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IScraperEnv): Promise<Response> {
    return newWorkersRpcResponse(request, new ScraperApi(env));
  },

  async queue(batch: MessageBatch<IScrapeMessage>, env: IScraperEnv): Promise<void> {
    if (batch.queue === "scraper-linktree") {
      await processBrowserBatch({ batch, env, expectedPageType: "linktree" });
    } else if (batch.queue === "scraper-beacons") {
      await processBrowserBatch({ batch, env, expectedPageType: "beacons" });
    } else if (batch.queue === "scraper-instagram") {
      await processBrowserBatch({ batch, env, expectedPageType: "instagram" });
    } else if (batch.queue === "scraper-tiktok") {
      await processBrowserBatch({ batch, env, expectedPageType: "tiktok" });
    } else if (batch.queue === "scraper-youtube") {
      await processBrowserBatch({ batch, env, expectedPageType: "youtube" });
    } else if (batch.queue === "scraper-truth-social") {
      await processTruthSocialBatch(batch, env);
    } else {
      for (const message of batch.messages) {
        const attemptCount = await env.SCRAPER_REPO.getByName(GLOBAL_SCRAPER_REPO_NAME).startAttempt(message.body.id);
        await processFailure({ env, message, attemptCount, error: new ScrapeError({ code: "queue-page-type-mismatch", message: `Unknown scraper Queue ${batch.queue}` }) });
      }
    }
  },
} satisfies ExportedHandler<IScraperEnv, IScrapeMessage>;
