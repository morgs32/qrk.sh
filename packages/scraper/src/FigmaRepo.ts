import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";
import { BrandTypeId } from "effect/Brand";

import { encodeRpc } from "./encodeRpc";
import { ScrapeError } from "./ScrapeError";
import { scrapeFigma } from "./scrapeFigma";
import type { IFigmaFilePreviewPayload, IRpcEither, IScraperEnv } from "./types";

const CACHE_TTL_MS = 60 * 60 * 1_000;

const figmaCache = sqliteTable("figma_cache", {
  url: text("url").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<IFigmaFilePreviewPayload>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const figmaMigrations = {
  "20260718000000_create_figma_cache.sql": `
CREATE TABLE figma_cache (
  url TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class FigmaRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightScrapes = new Map<string, Promise<IRpcEither<IFigmaFilePreviewPayload>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { figmaCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: figmaMigrations });
    });
  }

  getDesign(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>> {
    return this.#getFile(url, "design");
  }

  getBoard(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>> {
    return this.#getFile(url, "board");
  }

  getSlides(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>> {
    return this.#getFile(url, "slides");
  }

  getPrototype(url: string): Promise<IRpcEither<IFigmaFilePreviewPayload>> {
    return this.#getFile(url, "prototype");
  }

  async #getFile(
    url: string,
    expectedType: "design" | "board" | "slides" | "prototype",
  ): Promise<IRpcEither<IFigmaFilePreviewPayload>> {
    const normalized = await Effect.runPromise(
      Effect.gen(function* () {
        const parsed = yield* Effect.try({
          try: () => new URL(url),
          catch: () =>
            new ScrapeError({
              code: "invalid-scrape-request",
              message: "Figma file URL must be valid",
            }),
        });

        const pathSegments = parsed.pathname.split("/");
        const inputType = pathSegments[1];
        const fileKey = pathSegments[2];
        const hasSupportedHost =
          parsed.hostname === "figma.com" || parsed.hostname === "www.figma.com";
        const hasSupportedType =
          inputType === "design" ||
          inputType === "board" ||
          inputType === "slides" ||
          inputType === "deck" ||
          inputType === "proto";

        if (
          parsed.protocol !== "https:" ||
          !hasSupportedHost ||
          !hasSupportedType ||
          fileKey === undefined ||
          !/^[a-zA-Z0-9]{22,128}$/.test(fileKey)
        ) {
          return yield* new ScrapeError({
            code: "invalid-scrape-request",
            message:
              "Figma requests require a supported https://figma.com/<file-type>/<file-key> URL",
          });
        }

        const matchesExpectedType =
          (expectedType === "design" && inputType === "design") ||
          (expectedType === "board" && inputType === "board") ||
          (expectedType === "slides" && (inputType === "slides" || inputType === "deck")) ||
          (expectedType === "prototype" && inputType === "proto");

        if (!matchesExpectedType) {
          return yield* new ScrapeError({
            code: "file-type-mismatch",
            message: `The Figma URL does not identify the ${expectedType} variant`,
          });
        }

        const canonicalType = expectedType === "prototype" ? "proto" : expectedType;
        return `https://www.figma.com/${canonicalType}/${fileKey}`;
      }).pipe(encodeRpc),
    );

    if (normalized._tag === "Left") return normalized;
    const canonicalUrl = normalized.right;
    const cached = this.#db.select().from(figmaCache).where(eq(figmaCache.url, canonicalUrl)).get();

    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return { _tag: "Right", right: cached.payload };
    }

    const existingScrape = this.#inFlightScrapes.get(canonicalUrl);

    if (cached !== undefined) {
      if (existingScrape === undefined) {
        const refreshPromise = Effect.runPromise(
          scrapeFigma({ url: canonicalUrl, token: this.env.FIGMA_TOKEN }).pipe(encodeRpc),
        )
          .then((result) => {
            if (result._tag === "Right") {
              const refreshedAt = Date.now();
              this.#db
                .insert(figmaCache)
                .values({
                  url: canonicalUrl,
                  payload: result.right,
                  refreshedAt,
                  expiresAt: refreshedAt + CACHE_TTL_MS,
                })
                .onConflictDoUpdate({
                  target: figmaCache.url,
                  set: {
                    payload: result.right,
                    refreshedAt,
                    expiresAt: refreshedAt + CACHE_TTL_MS,
                  },
                })
                .run();
            }
            return result;
          })
          .catch(
            (cause): IRpcEither<IFigmaFilePreviewPayload> => ({
              _tag: "Left",
              left: {
                code: "scrape-persistence-failed",
                message: `Figma refresh failed: ${String(cause)}`,
              },
            }),
          );

        this.#inFlightScrapes.set(canonicalUrl, refreshPromise);
        this.ctx.waitUntil(
          refreshPromise
            .then((result) => {
              if (result._tag === "Left") {
                console.error(
                  JSON.stringify({
                    event: "scraper-background-refresh-failed",
                    repo: "FigmaRepo",
                    url: canonicalUrl,
                    error: result.left,
                  }),
                );
              }
            })
            .finally(() => {
              this.#inFlightScrapes.delete(canonicalUrl);
            }),
        );
      }

      return { _tag: "Right", right: cached.payload };
    }

    if (existingScrape !== undefined) return existingScrape;

    const scrapePromise = Effect.runPromise(
      scrapeFigma({ url: canonicalUrl, token: this.env.FIGMA_TOKEN }).pipe(encodeRpc),
    )
      .then((result) => {
        if (result._tag === "Right") {
          const refreshedAt = Date.now();
          this.#db
            .insert(figmaCache)
            .values({
              url: canonicalUrl,
              payload: result.right,
              refreshedAt,
              expiresAt: refreshedAt + CACHE_TTL_MS,
            })
            .onConflictDoUpdate({
              target: figmaCache.url,
              set: {
                payload: result.right,
                refreshedAt,
                expiresAt: refreshedAt + CACHE_TTL_MS,
              },
            })
            .run();
        }
        return result;
      })
      .catch(
        (cause): IRpcEither<IFigmaFilePreviewPayload> => ({
          _tag: "Left",
          left: {
            code: "scrape-persistence-failed",
            message: `Figma scrape failed: ${String(cause)}`,
          },
        }),
      );

    this.#inFlightScrapes.set(canonicalUrl, scrapePromise);
    try {
      return await scrapePromise;
    } finally {
      this.#inFlightScrapes.delete(canonicalUrl);
    }
  }
}
