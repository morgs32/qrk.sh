import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect, Schema } from "effect";
import { BrandTypeId } from "effect/Brand";

import { encodeRpc } from "./encodeRpc";
import { normalizeYouTubeUrl } from "./normalizeYouTubeUrl";
import { ScrapeError } from "./ScrapeError";
import { YouTubePayloadSchema } from "./schemas";
import type { IRpcEither, IScraperEnv, IYouTubeScrapePayload } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const GLOBAL_BROWSER_HOST_NAME = "global";

const youTubeCache = sqliteTable("youtube_cache", {
  url: text("url").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<IYouTubeScrapePayload>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const youTubeMigrations = {
  "20260717000000_create_youtube_cache.sql": `
CREATE TABLE youtube_cache (
  url TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class YouTubeRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightScrapes = new Map<string, Promise<IRpcEither<IYouTubeScrapePayload>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { youTubeCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: youTubeMigrations });
    });
  }

  async scrape(url: string): Promise<IRpcEither<IYouTubeScrapePayload>> {
    const normalized = await Effect.runPromise(normalizeYouTubeUrl(url).pipe(encodeRpc));
    if (normalized._tag === "Left") return normalized;
    const canonicalUrl = normalized.right;
    const cached = this.#db.select().from(youTubeCache).where(eq(youTubeCache.url, canonicalUrl)).get();
    if (cached !== undefined && cached.expiresAt > Date.now()) return { _tag: "Right", right: cached.payload };

    const existingScrape = this.#inFlightScrapes.get(canonicalUrl);
    if (cached !== undefined) {
      if (existingScrape === undefined) {
        const refreshPromise = this.env.BROWSER_HOST.getByName(GLOBAL_BROWSER_HOST_NAME).scrapeYouTube(canonicalUrl).then(async result => {
          if (result._tag === "Left") return result;
          const decoded = await Effect.runPromise(Schema.decodeUnknown(Schema.parseJson(YouTubePayloadSchema))(result.right, { onExcessProperty: "preserve" }).pipe(
            Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "BrowserHost returned an invalid YouTube payload" })),
            encodeRpc,
          ));
          if (decoded._tag === "Right") {
            const refreshedAt = Date.now();
            this.#db.insert(youTubeCache).values({ url: canonicalUrl, payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: youTubeCache.url, set: { payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
          }
          return decoded;
        }).catch((cause): IRpcEither<IYouTubeScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `YouTube refresh failed: ${String(cause)}` } }));
        this.#inFlightScrapes.set(canonicalUrl, refreshPromise);
        this.ctx.waitUntil(refreshPromise.then(result => {
          if (result._tag === "Left") console.error(JSON.stringify({ event: "scraper-background-refresh-failed", repo: "YouTubeRepo", url: canonicalUrl, error: result.left }));
        }).finally(() => {
          this.#inFlightScrapes.delete(canonicalUrl);
        }));
      }
      return { _tag: "Right", right: cached.payload };
    }

    if (existingScrape !== undefined) return existingScrape;
    const scrapePromise = this.env.BROWSER_HOST.getByName(GLOBAL_BROWSER_HOST_NAME).scrapeYouTube(canonicalUrl).then(async result => {
      if (result._tag === "Left") return result;
      const decoded = await Effect.runPromise(Schema.decodeUnknown(Schema.parseJson(YouTubePayloadSchema))(result.right, { onExcessProperty: "preserve" }).pipe(
        Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "BrowserHost returned an invalid YouTube payload" })),
        encodeRpc,
      ));
      if (decoded._tag === "Right") {
        const refreshedAt = Date.now();
        this.#db.insert(youTubeCache).values({ url: canonicalUrl, payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: youTubeCache.url, set: { payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
      }
      return decoded;
    }).catch((cause): IRpcEither<IYouTubeScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `YouTube scrape failed: ${String(cause)}` } }));
    this.#inFlightScrapes.set(canonicalUrl, scrapePromise);
    try {
      return await scrapePromise;
    } finally {
      this.#inFlightScrapes.delete(canonicalUrl);
    }
  }
}
