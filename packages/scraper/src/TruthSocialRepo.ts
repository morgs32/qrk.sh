import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";
import { BrandTypeId } from "effect/Brand";

import { encodeRpc } from "./encodeRpc";
import { normalizeTruthSocialUrl } from "./normalizeTruthSocialUrl";
import { scrapeTruthSocial } from "./scrapeTruthSocial";
import type { IRpcEither, IScraperEnv, ITruthSocialScrapePayload } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const truthSocialCache = sqliteTable("truth_social_cache", {
  url: text("url").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<ITruthSocialScrapePayload>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const truthSocialMigrations = {
  "20260717000000_create_truth_social_cache.sql": `
CREATE TABLE truth_social_cache (
  url TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class TruthSocialRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightScrapes = new Map<string, Promise<IRpcEither<ITruthSocialScrapePayload>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { truthSocialCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: truthSocialMigrations });
    });
  }

  async scrape(url: string): Promise<IRpcEither<ITruthSocialScrapePayload>> {
    const normalized = await Effect.runPromise(normalizeTruthSocialUrl(url).pipe(encodeRpc));
    if (normalized._tag === "Left") return normalized;
    const canonicalUrl = normalized.right;
    const cached = this.#db.select().from(truthSocialCache).where(eq(truthSocialCache.url, canonicalUrl)).get();
    if (cached !== undefined && cached.expiresAt > Date.now()) return { _tag: "Right", right: cached.payload };

    const existingScrape = this.#inFlightScrapes.get(canonicalUrl);
    if (cached !== undefined) {
      if (existingScrape === undefined) {
        const refreshPromise = Effect.runPromise(scrapeTruthSocial({ url: canonicalUrl }).pipe(encodeRpc)).then(result => {
          if (result._tag === "Right") {
            const refreshedAt = Date.now();
            this.#db.insert(truthSocialCache).values({ url: canonicalUrl, payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: truthSocialCache.url, set: { payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
          }
          return result;
        }).catch((cause): IRpcEither<ITruthSocialScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `Truth Social refresh failed: ${String(cause)}` } }));
        this.#inFlightScrapes.set(canonicalUrl, refreshPromise);
        this.ctx.waitUntil(refreshPromise.then(result => {
          if (result._tag === "Left") console.error(JSON.stringify({ event: "scraper-background-refresh-failed", repo: "TruthSocialRepo", url: canonicalUrl, error: result.left }));
        }).finally(() => {
          this.#inFlightScrapes.delete(canonicalUrl);
        }));
      }
      return { _tag: "Right", right: cached.payload };
    }

    if (existingScrape !== undefined) return existingScrape;
    const scrapePromise = Effect.runPromise(scrapeTruthSocial({ url: canonicalUrl }).pipe(encodeRpc)).then(result => {
      if (result._tag === "Right") {
        const refreshedAt = Date.now();
        this.#db.insert(truthSocialCache).values({ url: canonicalUrl, payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: truthSocialCache.url, set: { payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
      }
      return result;
    }).catch((cause): IRpcEither<ITruthSocialScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `Truth Social scrape failed: ${String(cause)}` } }));
    this.#inFlightScrapes.set(canonicalUrl, scrapePromise);
    try {
      return await scrapePromise;
    } finally {
      this.#inFlightScrapes.delete(canonicalUrl);
    }
  }
}
