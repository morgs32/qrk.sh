import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect, Schema } from "effect";
import { BrandTypeId } from "effect/Brand";

import { encodeRpc } from "./encodeRpc";
import { normalizeBeaconsUrl } from "./normalizeBeaconsUrl";
import { ScrapeError } from "./ScrapeError";
import { BeaconsPayloadSchema } from "./schemas";
import type { IBeaconsScrapePayload, IRpcEither, IScraperEnv } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const GLOBAL_BROWSER_HOST_NAME = "global";

const beaconsCache = sqliteTable("beacons_cache", {
  url: text("url").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<IBeaconsScrapePayload>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const beaconsMigrations = {
  "20260717000000_create_beacons_cache.sql": `
CREATE TABLE beacons_cache (
  url TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class BeaconsRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightScrapes = new Map<string, Promise<IRpcEither<IBeaconsScrapePayload>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { beaconsCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: beaconsMigrations });
    });
  }

  async scrape(url: string): Promise<IRpcEither<IBeaconsScrapePayload>> {
    const normalized = await Effect.runPromise(normalizeBeaconsUrl(url).pipe(encodeRpc));
    if (normalized._tag === "Left") {
      return normalized;
    }
    const canonicalUrl = normalized.right;
    const cached = this.#db.select().from(beaconsCache).where(eq(beaconsCache.url, canonicalUrl)).get();
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return { _tag: "Right", right: cached.payload };
    }

    const existingScrape = this.#inFlightScrapes.get(canonicalUrl);
    if (cached !== undefined) {
      if (existingScrape === undefined) {
        const refreshPromise = this.env.BROWSER_HOST.getByName(GLOBAL_BROWSER_HOST_NAME).scrapeBeacons(canonicalUrl).then(async result => {
          if (result._tag === "Left") return result;
          const decoded = await Effect.runPromise(Schema.decodeUnknown(Schema.parseJson(BeaconsPayloadSchema))(result.right, { onExcessProperty: "preserve" }).pipe(
            Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "BrowserHost returned an invalid Beacons payload" })),
            encodeRpc,
          ));
          if (decoded._tag === "Right") {
            const refreshedAt = Date.now();
            this.#db.insert(beaconsCache).values({ url: canonicalUrl, payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: beaconsCache.url, set: { payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
          }
          return decoded;
        }).catch((cause): IRpcEither<IBeaconsScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `Beacons refresh failed: ${String(cause)}` } }));
        this.#inFlightScrapes.set(canonicalUrl, refreshPromise);
        this.ctx.waitUntil(refreshPromise.then(result => {
          if (result._tag === "Left") {
            console.error(JSON.stringify({ event: "scraper-background-refresh-failed", repo: "BeaconsRepo", url: canonicalUrl, error: result.left }));
          }
        }).finally(() => {
          this.#inFlightScrapes.delete(canonicalUrl);
        }));
      }
      return { _tag: "Right", right: cached.payload };
    }

    if (existingScrape !== undefined) {
      return existingScrape;
    }
    const scrapePromise = this.env.BROWSER_HOST.getByName(GLOBAL_BROWSER_HOST_NAME).scrapeBeacons(canonicalUrl).then(async result => {
      if (result._tag === "Left") return result;
      const decoded = await Effect.runPromise(Schema.decodeUnknown(Schema.parseJson(BeaconsPayloadSchema))(result.right, { onExcessProperty: "preserve" }).pipe(
        Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "BrowserHost returned an invalid Beacons payload" })),
        encodeRpc,
      ));
      if (decoded._tag === "Right") {
        const refreshedAt = Date.now();
        this.#db.insert(beaconsCache).values({ url: canonicalUrl, payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: beaconsCache.url, set: { payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
      }
      return decoded;
    }).catch((cause): IRpcEither<IBeaconsScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `Beacons scrape failed: ${String(cause)}` } }));
    this.#inFlightScrapes.set(canonicalUrl, scrapePromise);
    try {
      return await scrapePromise;
    } finally {
      this.#inFlightScrapes.delete(canonicalUrl);
    }
  }
}
