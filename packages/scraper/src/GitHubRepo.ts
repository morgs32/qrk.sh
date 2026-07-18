import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";
import { BrandTypeId } from "effect/Brand";

import { encodeRpc } from "./encodeRpc";
import { normalizeGitHubUrl } from "./normalizeGitHubUrl";
import { scrapeGitHub } from "./scrapeGitHub";
import type { IGitHubScrapePayload, IRpcEither, IScraperEnv } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const gitHubCache = sqliteTable("github_cache", {
  url: text("url").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<IGitHubScrapePayload>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const gitHubMigrations = {
  "20260717000000_create_github_cache.sql": `
CREATE TABLE github_cache (
  url TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class GitHubRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightScrapes = new Map<string, Promise<IRpcEither<IGitHubScrapePayload>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { gitHubCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: gitHubMigrations });
    });
  }

  async getProfile(url: string): Promise<IRpcEither<IGitHubScrapePayload>> {
    const normalized = await Effect.runPromise(normalizeGitHubUrl(url).pipe(encodeRpc));
    if (normalized._tag === "Left") return normalized;
    const canonicalUrl = normalized.right;
    const cached = this.#db.select().from(gitHubCache).where(eq(gitHubCache.url, canonicalUrl)).get();
    if (cached !== undefined && cached.expiresAt > Date.now()) return { _tag: "Right", right: cached.payload };

    const existingScrape = this.#inFlightScrapes.get(canonicalUrl);
    if (cached !== undefined) {
      if (existingScrape === undefined) {
        const refreshPromise = Effect.runPromise(scrapeGitHub({ url: canonicalUrl, token: this.env.GITHUB_TOKEN }).pipe(encodeRpc)).then(result => {
          if (result._tag === "Right") {
            const refreshedAt = Date.now();
            this.#db.insert(gitHubCache).values({ url: canonicalUrl, payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: gitHubCache.url, set: { payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
          }
          return result;
        }).catch((cause): IRpcEither<IGitHubScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `GitHub refresh failed: ${String(cause)}` } }));
        this.#inFlightScrapes.set(canonicalUrl, refreshPromise);
        this.ctx.waitUntil(refreshPromise.then(result => {
          if (result._tag === "Left") console.error(JSON.stringify({ event: "scraper-background-refresh-failed", repo: "GitHubRepo", url: canonicalUrl, error: result.left }));
        }).finally(() => {
          this.#inFlightScrapes.delete(canonicalUrl);
        }));
      }
      return { _tag: "Right", right: cached.payload };
    }

    if (existingScrape !== undefined) return existingScrape;
    const scrapePromise = Effect.runPromise(scrapeGitHub({ url: canonicalUrl, token: this.env.GITHUB_TOKEN }).pipe(encodeRpc)).then(result => {
      if (result._tag === "Right") {
        const refreshedAt = Date.now();
        this.#db.insert(gitHubCache).values({ url: canonicalUrl, payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS }).onConflictDoUpdate({ target: gitHubCache.url, set: { payload: result.right, refreshedAt, expiresAt: refreshedAt + CACHE_TTL_MS } }).run();
      }
      return result;
    }).catch((cause): IRpcEither<IGitHubScrapePayload> => ({ _tag: "Left", left: { code: "scrape-persistence-failed", message: `GitHub scrape failed: ${String(cause)}` } }));
    this.#inFlightScrapes.set(canonicalUrl, scrapePromise);
    try {
      return await scrapePromise;
    } finally {
      this.#inFlightScrapes.delete(canonicalUrl);
    }
  }
}
