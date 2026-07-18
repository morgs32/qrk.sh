import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { BrandTypeId } from "effect/Brand";
import { Either, Schema } from "effect";

import type { IGooglePlaceDetails, IGooglePlaceSuggestion, IRpcEither, IScraperEnv } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const GoogleAutocompleteResponse = Schema.Struct({
  suggestions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        placePrediction: Schema.optional(
          Schema.Struct({
            placeId: Schema.String,
            text: Schema.Struct({ text: Schema.String }),
            structuredFormat: Schema.optional(
              Schema.Struct({
                mainText: Schema.Struct({ text: Schema.String }),
                secondaryText: Schema.optional(Schema.Struct({ text: Schema.String })),
              }),
            ),
          }),
        ),
      }),
    ),
  ),
});

const GooglePlaceDetailsResponse = Schema.Struct({
  id: Schema.String,
  displayName: Schema.Struct({ text: Schema.String }),
  formattedAddress: Schema.optional(Schema.String),
  location: Schema.Struct({
    latitude: Schema.Number,
    longitude: Schema.Number,
  }),
});

const googlePlacesCache = sqliteTable("google_places_cache", {
  googlePlaceId: text("google_place_id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<IGooglePlaceDetails>().notNull(),
  refreshedAt: integer("refreshed_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

const googlePlacesMigrations = {
  "20260718000000_create_google_places_cache.sql": `
CREATE TABLE google_places_cache (
  google_place_id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
};

export class GooglePlacesRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  readonly #db;
  readonly #inFlightPlaceRequests = new Map<string, Promise<IRpcEither<IGooglePlaceDetails>>>();

  constructor(ctx: DurableObjectState, env: IScraperEnv) {
    super(ctx, env);
    this.#db = drizzle(ctx.storage, { schema: { googlePlacesCache } });
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.#db, { migrations: googlePlacesMigrations });
    });
  }

  async autocomplete(query: string): Promise<IRpcEither<ReadonlyArray<IGooglePlaceSuggestion>>> {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      return { _tag: "Right", right: [] };
    }

    if (this.env.GOOGLE_PLACES_API_KEY.trim().length === 0) {
      return {
        _tag: "Left",
        left: {
          code: "provider-configuration-error",
          message: "GOOGLE_PLACES_API_KEY is required for Google Places requests",
          retryable: false,
        },
      };
    }

    try {
      const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.env.GOOGLE_PLACES_API_KEY,
        },
        body: JSON.stringify({ input: normalizedQuery }),
      });

      if (!response.ok) {
        return {
          _tag: "Left",
          left: {
            code: response.status >= 500 ? "scrape-transient-failure" : "place-unavailable",
            message: `Google Places autocomplete failed with HTTP ${response.status}`,
            retryable: response.status >= 500,
          },
        };
      }

      const responseJson: unknown = await response.json();
      const decoded = Schema.decodeUnknownEither(GoogleAutocompleteResponse)(responseJson, {
        onExcessProperty: "ignore",
      });

      if (Either.isLeft(decoded)) {
        return {
          _tag: "Left",
          left: {
            code: "unsupported-page-shape",
            message: "Google Places autocomplete returned an unsupported response shape",
            retryable: false,
          },
        };
      }

      const suggestions: Array<IGooglePlaceSuggestion> = [];

      for (const suggestion of decoded.right.suggestions ?? []) {
        if (suggestion.placePrediction === undefined) {
          continue;
        }

        suggestions.push({
          placeId: suggestion.placePrediction.placeId,
          description: suggestion.placePrediction.text.text,
          mainText:
            suggestion.placePrediction.structuredFormat?.mainText.text ??
            suggestion.placePrediction.text.text,
          secondaryText: suggestion.placePrediction.structuredFormat?.secondaryText?.text ?? "",
        });
      }

      return { _tag: "Right", right: suggestions };
    } catch (cause) {
      return {
        _tag: "Left",
        left: {
          code: "scrape-transient-failure",
          message: `Google Places autocomplete request failed: ${String(cause)}`,
          retryable: true,
        },
      };
    }
  }

  async getPlace(googlePlaceId: string): Promise<IRpcEither<IGooglePlaceDetails>> {
    const normalizedGooglePlaceId = googlePlaceId.trim();

    if (normalizedGooglePlaceId.length === 0) {
      return {
        _tag: "Left",
        left: {
          code: "invalid-scrape-request",
          message: "Google Places details require a non-empty place ID",
          retryable: false,
        },
      };
    }

    if (this.env.GOOGLE_PLACES_API_KEY.trim().length === 0) {
      return {
        _tag: "Left",
        left: {
          code: "provider-configuration-error",
          message: "GOOGLE_PLACES_API_KEY is required for Google Places requests",
          retryable: false,
        },
      };
    }

    const cached = this.#db
      .select()
      .from(googlePlacesCache)
      .where(eq(googlePlacesCache.googlePlaceId, normalizedGooglePlaceId))
      .get();

    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return { _tag: "Right", right: cached.payload };
    }

    const existingRequest = this.#inFlightPlaceRequests.get(normalizedGooglePlaceId);
    if (existingRequest !== undefined) {
      if (cached !== undefined) {
        return { _tag: "Right", right: cached.payload };
      }

      return existingRequest;
    }

    const placeRequest: Promise<IRpcEither<IGooglePlaceDetails>> = (async (): Promise<
      IRpcEither<IGooglePlaceDetails>
    > => {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedGooglePlaceId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.env.GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
          },
        },
      );

      if (!response.ok) {
        return {
          _tag: "Left",
          left: {
            code: response.status >= 500 ? "scrape-transient-failure" : "place-unavailable",
            message: `Google Places details failed with HTTP ${response.status}`,
            retryable: response.status >= 500,
          },
        };
      }

      const responseJson: unknown = await response.json();
      const decoded = Schema.decodeUnknownEither(GooglePlaceDetailsResponse)(responseJson, {
        onExcessProperty: "ignore",
      });

      if (Either.isLeft(decoded)) {
        return {
          _tag: "Left",
          left: {
            code: "unsupported-page-shape",
            message: "Google Places details returned an unsupported response shape",
            retryable: false,
          },
        };
      }

      const payload: IGooglePlaceDetails = {
        googlePlaceId: decoded.right.id,
        name: decoded.right.displayName.text,
        address: decoded.right.formattedAddress ?? "",
        latitude: decoded.right.location.latitude,
        longitude: decoded.right.location.longitude,
      };
      const refreshedAt = Date.now();

      this.#db
        .insert(googlePlacesCache)
        .values({
          googlePlaceId: normalizedGooglePlaceId,
          payload,
          refreshedAt,
          expiresAt: refreshedAt + CACHE_TTL_MS,
        })
        .onConflictDoUpdate({
          target: googlePlacesCache.googlePlaceId,
          set: {
            payload,
            refreshedAt,
            expiresAt: refreshedAt + CACHE_TTL_MS,
          },
        })
        .run();

      return { _tag: "Right", right: payload };
    })().catch(
      (cause): IRpcEither<IGooglePlaceDetails> => ({
        _tag: "Left",
        left: {
          code: "scrape-transient-failure",
          message: `Google Places details request failed: ${String(cause)}`,
          retryable: true,
        },
      }),
    );

    this.#inFlightPlaceRequests.set(normalizedGooglePlaceId, placeRequest);

    if (cached !== undefined) {
      this.ctx.waitUntil(
        placeRequest
          .then((result) => {
            if (result._tag === "Left") {
              console.error(
                JSON.stringify({
                  event: "scraper-background-refresh-failed",
                  repo: "GooglePlacesRepo",
                  googlePlaceId: normalizedGooglePlaceId,
                  error: result.left,
                }),
              );
            }
          })
          .finally(() => {
            this.#inFlightPlaceRequests.delete(normalizedGooglePlaceId);
          }),
      );

      return { _tag: "Right", right: cached.payload };
    }

    try {
      return await placeRequest;
    } finally {
      this.#inFlightPlaceRequests.delete(normalizedGooglePlaceId);
    }
  }
}
