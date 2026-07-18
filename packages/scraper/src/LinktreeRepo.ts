import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect, Schema } from "effect";
import { BrandTypeId } from "effect/Brand";

import { encodeRpc } from "./encodeRpc";
import { normalizeLinktreeUrl } from "./normalizeLinktreeUrl";
import { ScrapeError } from "./ScrapeError";
import { LinktreePayloadSchema } from "./schemas";
import type { ILinktreeScrapePayload, IRpcEither, IScraperEnv } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const GLOBAL_BROWSER_HOST_NAME = "global";

const linktreeCache = sqliteTable("linktree_cache", {
  url: text("url").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<ILinktreeScrapePayload>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const linktreeMigrations = {
  "20260717000000_create_linktree_cache.sql": `
CREATE TABLE linktree_cache (
  url TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class LinktreeRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightScrapes = new Map<string, Promise<IRpcEither<ILinktreeScrapePayload>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { linktreeCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: linktreeMigrations });
    });
  }

  async scrape(url: string): Promise<IRpcEither<ILinktreeScrapePayload>> {
    const normalized = await Effect.runPromise(normalizeLinktreeUrl(url).pipe(encodeRpc));
    if (normalized._tag === "Left") {
      return normalized;
    }
    const canonicalUrl = normalized.right;
    const cached = this.#db.select().from(linktreeCache).where(eq(linktreeCache.url, canonicalUrl)).get();
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return { _tag: "Right", right: cached.payload };
    }

    const existingScrape = this.#inFlightScrapes.get(canonicalUrl);
    if (cached !== undefined) {
      if (existingScrape === undefined) {
        const refreshPromise = this.env.BROWSER_HOST.getByName(GLOBAL_BROWSER_HOST_NAME).scrapeLinktree(canonicalUrl).then(async result => {
          if (result._tag === "Left") {
            return result;
          }
          const decoded = await Effect.runPromise(Schema.decodeUnknown(Schema.parseJson(LinktreePayloadSchema))(result.right, { onExcessProperty: "preserve" }).pipe(
            Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "BrowserHost returned an invalid Linktree payload" })),
            encodeRpc,
          ));
          if (decoded._tag === "Right") {
            const refreshedAt = Date.now();
            this.#db.insert(linktreeCache).values({ url: canonicalUrl, payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: linktreeCache.url, set: { payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
          }
          return decoded;
        }).catch((cause): IRpcEither<ILinktreeScrapePayload> => ({
          _tag: "Left",
          left: { code: "scrape-persistence-failed", message: `Linktree refresh failed: ${String(cause)}` },
        }));
        this.#inFlightScrapes.set(canonicalUrl, refreshPromise);
        this.ctx.waitUntil(refreshPromise.then(result => {
          if (result._tag === "Left") {
            console.error(JSON.stringify({ event: "scraper-background-refresh-failed", repo: "LinktreeRepo", url: canonicalUrl, error: result.left }));
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
    const scrapePromise = this.env.BROWSER_HOST.getByName(GLOBAL_BROWSER_HOST_NAME).scrapeLinktree(canonicalUrl).then(async result => {
      if (result._tag === "Left") {
        return result;
      }
      const decoded = await Effect.runPromise(Schema.decodeUnknown(Schema.parseJson(LinktreePayloadSchema))(result.right, { onExcessProperty: "preserve" }).pipe(
        Effect.mapError(() => new ScrapeError({ code: "unsupported-page-shape", message: "BrowserHost returned an invalid Linktree payload" })),
        encodeRpc,
      ));
      if (decoded._tag === "Right") {
        const refreshedAt = Date.now();
        this.#db.insert(linktreeCache).values({ url: canonicalUrl, payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: linktreeCache.url, set: { payload: decoded.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
      }
      return decoded;
    }).catch((cause): IRpcEither<ILinktreeScrapePayload> => ({
      _tag: "Left",
      left: { code: "scrape-persistence-failed", message: `Linktree scrape failed: ${String(cause)}` },
    }));
    this.#inFlightScrapes.set(canonicalUrl, scrapePromise);
    try {
      return await scrapePromise;
    } finally {
      this.#inFlightScrapes.delete(canonicalUrl);
    }
  }
}
