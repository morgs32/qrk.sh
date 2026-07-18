import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Either, Schema } from "effect";
import { BrandTypeId } from "effect/Brand";

import { LinkPreviewSchema } from "./schemas";
import type { ILinkPreview, IRpcEither, IScraperEnv } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const JsonLdPreviewObjectSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  headline: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  image: Schema.optional(
    Schema.Union(Schema.String, Schema.Array(Schema.String), Schema.Struct({ url: Schema.String })),
  ),
  publisher: Schema.optional(Schema.Union(Schema.String, Schema.Struct({ name: Schema.String }))),
});

const JsonLdPreviewDocumentSchema = Schema.Union(
  JsonLdPreviewObjectSchema,
  Schema.Array(JsonLdPreviewObjectSchema),
);

const linkPreviewCache = sqliteTable("link_preview_cache", {
  url: text("url").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<ILinkPreview>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const linkPreviewMigrations = {
  "20260718000000_create_link_preview_cache.sql": `
CREATE TABLE link_preview_cache (
  url TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class LinkRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightPreviews = new Map<string, Promise<IRpcEither<ILinkPreview>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { linkPreviewCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: linkPreviewMigrations });
    });
  }

  async getPreview(url: string): Promise<IRpcEither<ILinkPreview>> {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return {
        _tag: "Left",
        left: {
          code: "invalid-scrape-request",
          message: "Link preview requires a valid HTTP or HTTPS URL",
          retryable: false,
        },
      };
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return {
        _tag: "Left",
        left: {
          code: "invalid-scrape-request",
          message: "Link preview requires an HTTP or HTTPS URL",
          retryable: false,
        },
      };
    }

    parsedUrl.hash = "";
    const canonicalUrl = parsedUrl.toString();
    const cached = this.#db
      .select()
      .from(linkPreviewCache)
      .where(eq(linkPreviewCache.url, canonicalUrl))
      .get();

    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return { _tag: "Right", right: cached.payload };
    }

    const existingRequest = this.#inFlightPreviews.get(canonicalUrl);
    if (existingRequest !== undefined) {
      if (cached !== undefined) {
        return { _tag: "Right", right: cached.payload };
      }

      return existingRequest;
    }

    const previewRequest: Promise<IRpcEither<ILinkPreview>> = (async () => {
      try {
        const response = await fetch(canonicalUrl, {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "qrk.sh link preview",
          },
          redirect: "follow",
        });

        if (!response.ok) {
          return {
            _tag: "Left",
            left: {
              code: response.status >= 500 ? "scrape-transient-failure" : "link-unavailable",
              message: `Link preview request failed with HTTP ${response.status}`,
              retryable: response.status >= 500,
            },
          };
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("text/html")) {
          return {
            _tag: "Left",
            left: {
              code: "unsupported-page-shape",
              message: "Link preview response was not HTML",
              retryable: false,
            },
          };
        }

        let openGraphTitle = "";
        let openGraphDescription = "";
        let openGraphSiteName = "";
        let openGraphImageUrl = "";
        let iconUrl = "";
        let documentTitle = "";
        let jsonLdText = "";
        let jsonLdComplete = false;

        const transformedResponse = new HTMLRewriter()
          .on('meta[property="og:title"]', {
            element(element) {
              openGraphTitle = element.getAttribute("content")?.trim() ?? "";
            },
          })
          .on('meta[property="og:description"]', {
            element(element) {
              openGraphDescription = element.getAttribute("content")?.trim() ?? "";
            },
          })
          .on('meta[property="og:site_name"]', {
            element(element) {
              openGraphSiteName = element.getAttribute("content")?.trim() ?? "";
            },
          })
          .on('meta[property="og:image"]', {
            element(element) {
              openGraphImageUrl = element.getAttribute("content")?.trim() ?? "";
            },
          })
          .on('link[rel="icon"]', {
            element(element) {
              if (iconUrl.length === 0) {
                iconUrl = element.getAttribute("href")?.trim() ?? "";
              }
            },
          })
          .on('link[rel="shortcut icon"]', {
            element(element) {
              if (iconUrl.length === 0) {
                iconUrl = element.getAttribute("href")?.trim() ?? "";
              }
            },
          })
          .on("title", {
            text(textChunk) {
              documentTitle += textChunk.text;
            },
          })
          .on('script[type="application/ld+json"]', {
            text(textChunk) {
              if (!jsonLdComplete) {
                jsonLdText += textChunk.text;
                jsonLdComplete = textChunk.lastInTextNode;
              }
            },
          })
          .transform(response);

        await transformedResponse.text();

        let jsonLdTitle = "";
        let jsonLdDescription = "";
        let jsonLdSiteName = "";
        let jsonLdImageUrl = "";

        if (jsonLdText.trim().length > 0) {
          try {
            const jsonLdUnknown: unknown = JSON.parse(jsonLdText);
            const decodedJsonLd = Schema.decodeUnknownEither(JsonLdPreviewDocumentSchema)(
              jsonLdUnknown,
              { onExcessProperty: "ignore" },
            );

            if (Either.isRight(decodedJsonLd)) {
              const jsonLd = Array.isArray(decodedJsonLd.right)
                ? decodedJsonLd.right[0]
                : decodedJsonLd.right;

              if (jsonLd !== undefined) {
                jsonLdTitle = jsonLd.headline ?? jsonLd.name ?? "";
                jsonLdDescription = jsonLd.description ?? "";

                if (typeof jsonLd.publisher === "string") {
                  jsonLdSiteName = jsonLd.publisher;
                } else if (jsonLd.publisher !== undefined) {
                  jsonLdSiteName = jsonLd.publisher.name;
                }

                if (typeof jsonLd.image === "string") {
                  jsonLdImageUrl = jsonLd.image;
                } else if (Array.isArray(jsonLd.image)) {
                  jsonLdImageUrl = jsonLd.image[0] ?? "";
                } else if (jsonLd.image !== undefined) {
                  jsonLdImageUrl = jsonLd.image.url;
                }
              }
            }
          } catch {
            // Invalid JSON-LD does not invalidate otherwise usable Open Graph metadata.
          }
        }

        let resolvedImageUrl = jsonLdImageUrl || openGraphImageUrl;
        if (resolvedImageUrl.length > 0) {
          try {
            resolvedImageUrl = new URL(resolvedImageUrl, canonicalUrl).toString();
          } catch {
            resolvedImageUrl = "";
          }
        }

        let resolvedIconUrl = iconUrl;
        if (resolvedIconUrl.length > 0) {
          try {
            resolvedIconUrl = new URL(resolvedIconUrl, canonicalUrl).toString();
          } catch {
            resolvedIconUrl = "";
          }
        }

        if (resolvedIconUrl.length === 0) {
          resolvedIconUrl = new URL("/favicon.ico", canonicalUrl).toString();
        }

        const previewCandidate = {
          url: canonicalUrl,
          title: jsonLdTitle || openGraphTitle || documentTitle.trim(),
          description: jsonLdDescription || openGraphDescription,
          siteName: jsonLdSiteName || openGraphSiteName || parsedUrl.hostname,
          imageUrl: resolvedImageUrl,
          iconUrl: resolvedIconUrl,
        };
        const decodedPreview = Schema.decodeUnknownEither(LinkPreviewSchema)(previewCandidate, {
          onExcessProperty: "error",
        });

        if (Either.isLeft(decodedPreview) || decodedPreview.right.title.length === 0) {
          return {
            _tag: "Left",
            left: {
              code: "unsupported-page-shape",
              message: "Link preview page did not provide a title",
              retryable: false,
            },
          };
        }

        const refreshedAt = Date.now();
        this.#db
          .insert(linkPreviewCache)
          .values({
            url: canonicalUrl,
            payload: decodedPreview.right,
            refreshedAt,
            expiresAt: refreshedAt + CACHE_TTL_MS,
          })
          .onConflictDoUpdate({
            target: linkPreviewCache.url,
            set: {
              payload: decodedPreview.right,
              refreshedAt,
              expiresAt: refreshedAt + CACHE_TTL_MS,
            },
          })
          .run();

        return { _tag: "Right", right: decodedPreview.right };
      } catch (cause) {
        return {
          _tag: "Left",
          left: {
            code: "scrape-transient-failure",
            message: `Link preview request failed: ${String(cause)}`,
            retryable: true,
          },
        };
      }
    })();

    this.#inFlightPreviews.set(canonicalUrl, previewRequest);

    if (cached !== undefined) {
      this.ctx.waitUntil(
        previewRequest
          .then((result) => {
            if (result._tag === "Left") {
              console.error(
                JSON.stringify({
                  event: "scraper-background-refresh-failed",
                  repo: "LinkRepo",
                  url: canonicalUrl,
                  error: result.left,
                }),
              );
            }
          })
          .finally(() => {
            this.#inFlightPreviews.delete(canonicalUrl);
          }),
      );
      return { _tag: "Right", right: cached.payload };
    }

    try {
      return await previewRequest;
    } finally {
      this.#inFlightPreviews.delete(canonicalUrl);
    }
  }
}
