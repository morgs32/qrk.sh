import { RpcTarget } from "capnweb";
import { Effect, Schema } from "effect";

import { encodeRpc } from "./encodeRpc";
import { normalizeBeaconsUrl } from "./normalizeBeaconsUrl";
import { normalizeInstagramUrl } from "./normalizeInstagramUrl";
import { normalizeGitHubUrl } from "./normalizeGitHubUrl";
import { normalizeLinktreeUrl } from "./normalizeLinktreeUrl";
import { normalizeTikTokUrl } from "./normalizeTikTokUrl";
import { normalizeTruthSocialUrl } from "./normalizeTruthSocialUrl";
import { normalizeYouTubeUrl } from "./normalizeYouTubeUrl";
import { ScrapeError } from "./ScrapeError";
import { GitHubJobReservationSchema, SubmitScrapeSchema } from "./schemas";
import type { IRpcEither, IScrapeJob, IScrapeMessage, IScraperEnv } from "./types";

const GLOBAL_SCRAPER_REPO_NAME = "global";

export class ScraperApi extends RpcTarget {
  constructor(private readonly workerEnv: IScraperEnv) {
    super();
  }

  async submitScrape(input: unknown): Promise<IRpcEither<{ id: string }>> {
    const workerEnv = this.workerEnv;
    return Effect.runPromise(
      Effect.gen(function* () {
        const request = yield* Schema.decodeUnknown(SubmitScrapeSchema)(input, { onExcessProperty: "error" }).pipe(
          Effect.mapError(() => new ScrapeError({ code: "invalid-scrape-request", message: "Scrape request must contain a supported pageType and url" })),
        );

        let url: string;
        if (request.pageType === "linktree") {
          url = yield* normalizeLinktreeUrl(request.url);
        } else if (request.pageType === "beacons") {
          url = yield* normalizeBeaconsUrl(request.url);
        } else if (request.pageType === "instagram") {
          url = yield* normalizeInstagramUrl(request.url);
        } else if (request.pageType === "github") {
          url = yield* normalizeGitHubUrl(request.url);
        } else if (request.pageType === "tiktok") {
          url = yield* normalizeTikTokUrl(request.url);
        } else if (request.pageType === "youtube") {
          url = yield* normalizeYouTubeUrl(request.url);
        } else {
          url = yield* normalizeTruthSocialUrl(request.url);
        }

        const message: IScrapeMessage = { id: crypto.randomUUID(), pageType: request.pageType, url };
        const repo = workerEnv.SCRAPER_REPO.getByName(GLOBAL_SCRAPER_REPO_NAME);
        if (request.pageType === "github") {
          const resultUnknown = yield* Effect.tryPromise({
            try: () => repo.findOrCreateGitHubJob(message),
            catch: cause => new ScrapeError({ code: "scrape-persistence-failed", message: `Failed to find or create GitHub scrape job: ${String(cause)}` }),
          });
          const result = yield* Schema.decodeUnknown(GitHubJobReservationSchema)(resultUnknown).pipe(
            Effect.mapError(() => new ScrapeError({ code: "scrape-persistence-failed", message: "ScraperRepo returned an invalid GitHub job reservation" })),
          );
          if (!result.created) {
            return { id: result.id };
          }
        } else {
          yield* Effect.tryPromise({
            try: () => repo.createJob(message),
            catch: cause => new ScrapeError({ code: "scrape-persistence-failed", message: `Failed to create scrape job: ${String(cause)}` }),
          });
        }

        if (request.pageType === "linktree") {
          yield* Effect.tryPromise({ try: () => workerEnv.LINKTREE_QUEUE.send(message), catch: cause => new ScrapeError({ code: "scrape-queue-failed", message: `Failed to enqueue Linktree scrape: ${String(cause)}` }) });
        } else if (request.pageType === "beacons") {
          yield* Effect.tryPromise({ try: () => workerEnv.BEACONS_QUEUE.send(message), catch: cause => new ScrapeError({ code: "scrape-queue-failed", message: `Failed to enqueue Beacons scrape: ${String(cause)}` }) });
        } else if (request.pageType === "instagram") {
          yield* Effect.tryPromise({ try: () => workerEnv.INSTAGRAM_QUEUE.send(message), catch: cause => new ScrapeError({ code: "scrape-queue-failed", message: `Failed to enqueue Instagram scrape: ${String(cause)}` }) });
        } else if (request.pageType === "github") {
          yield* Effect.tryPromise({
            try: async () => {
              try {
                await workerEnv.GITHUB_QUEUE.send(message);
              } catch (cause) {
                await repo.failJob({ id: message.id, error: `Failed to enqueue GitHub scrape: ${String(cause)}` });
                throw cause;
              }
            },
            catch: cause => new ScrapeError({ code: "scrape-queue-failed", message: `Failed to enqueue GitHub scrape: ${String(cause)}` }),
          });
        } else if (request.pageType === "tiktok") {
          yield* Effect.tryPromise({ try: () => workerEnv.TIKTOK_QUEUE.send(message), catch: cause => new ScrapeError({ code: "scrape-queue-failed", message: `Failed to enqueue TikTok scrape: ${String(cause)}` }) });
        } else if (request.pageType === "youtube") {
          yield* Effect.tryPromise({ try: () => workerEnv.YOUTUBE_QUEUE.send(message), catch: cause => new ScrapeError({ code: "scrape-queue-failed", message: `Failed to enqueue YouTube scrape: ${String(cause)}` }) });
        } else {
          yield* Effect.tryPromise({ try: () => workerEnv.TRUTH_SOCIAL_QUEUE.send(message), catch: cause => new ScrapeError({ code: "scrape-queue-failed", message: `Failed to enqueue Truth Social scrape: ${String(cause)}` }) });
        }
        return { id: message.id };
      }).pipe(encodeRpc),
    );
  }

  async getScrape(id: string): Promise<IRpcEither<IScrapeJob>> {
    const workerEnv = this.workerEnv;
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = workerEnv.SCRAPER_REPO.getByName(GLOBAL_SCRAPER_REPO_NAME);
        const job = yield* Effect.tryPromise({
          try: () => repo.getJob(id),
          catch: cause => new ScrapeError({ code: "scrape-persistence-failed", message: `Failed to read scrape job: ${String(cause)}` }),
        });
        if (job === null) {
          return yield* new ScrapeError({ code: "scrape-job-not-found", message: `Scrape job ${id} was not found` });
        }
        return job;
      }).pipe(encodeRpc),
    );
  }
}
