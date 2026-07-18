import { DurableObject } from "cloudflare:workers";
import { Either, Schema } from "effect";
import { BrandTypeId } from "effect/Brand";

import type { IJsonValue, IRpcEither, IScraperEnv } from "./types";

const StreamlineSearchResponse = Schema.Struct({
  query: Schema.String,
  results: Schema.Array(
    Schema.Struct({
      hash: Schema.String,
      name: Schema.String,
      imagePreviewUrl: Schema.String,
      familyName: Schema.String,
      isFree: Schema.Boolean,
    }),
  ),
  pagination: Schema.Struct({
    total: Schema.Number,
    hasMore: Schema.Boolean,
    offset: Schema.Number,
    nextOffset: Schema.Number,
  }),
});

const StreamlineIconResponse = Schema.Struct({
  hash: Schema.String,
  name: Schema.String,
});

export class StreamlineRepo extends DurableObject<IScraperEnv> {
  declare [BrandTypeId]: "TargetApi";

  async search(
    query: string,
    offset: number,
    limit: number,
  ): Promise<
    IRpcEither<{
      query: string;
      results: ReadonlyArray<{
        hash: string;
        name: string;
        imagePreviewUrl: string;
        familyName: string;
        isFree: boolean;
      }>;
      pagination: {
        total: number;
        hasMore: boolean;
        offset: number;
        nextOffset: number;
      };
    }>
  > {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      return {
        _tag: "Right",
        right: {
          query: normalizedQuery,
          results: [],
          pagination: { total: 0, hasMore: false, offset: 0, nextOffset: 0 },
        },
      };
    }

    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return {
        _tag: "Left",
        left: {
          code: "invalid-scrape-request",
          message:
            "Streamline search requires an offset of zero or greater and a limit from 1 to 100",
          retryable: false,
        },
      };
    }

    if (this.env.STREAMLINE_API_KEY.trim().length === 0) {
      return {
        _tag: "Left",
        left: {
          code: "provider-configuration-error",
          message: "STREAMLINE_API_KEY is required for Streamline requests",
          retryable: false,
        },
      };
    }

    const searchUrl = new URL("https://public-api.streamlinehq.com/v1/search/global");
    searchUrl.searchParams.set("productType", "icons");
    searchUrl.searchParams.set("productTier", "free");
    searchUrl.searchParams.set("query", normalizedQuery);
    searchUrl.searchParams.set("offset", String(offset));
    searchUrl.searchParams.set("limit", String(limit));

    try {
      const response = await fetch(searchUrl, {
        headers: { "x-api-key": this.env.STREAMLINE_API_KEY },
      });

      if (!response.ok) {
        return {
          _tag: "Left",
          left: {
            code: response.status >= 500 ? "scrape-transient-failure" : "file-unavailable",
            message: `Streamline search failed with HTTP ${response.status}`,
            retryable: response.status >= 500,
          },
        };
      }

      const responseJson: unknown = await response.json();
      const decoded = Schema.decodeUnknownEither(StreamlineSearchResponse)(responseJson, {
        onExcessProperty: "ignore",
      });

      if (Either.isLeft(decoded)) {
        return {
          _tag: "Left",
          left: {
            code: "unsupported-page-shape",
            message: "Streamline search returned an unsupported response shape",
            retryable: false,
          },
        };
      }

      return { _tag: "Right", right: decoded.right };
    } catch (cause) {
      return {
        _tag: "Left",
        left: {
          code: "scrape-transient-failure",
          message: `Streamline search request failed: ${String(cause)}`,
          retryable: true,
        },
      };
    }
  }

  async getSvg(hash: string): Promise<IRpcEither<IJsonValue>> {
    const normalizedHash = hash.trim();

    if (!/^ico_[a-zA-Z0-9]+$/.test(normalizedHash)) {
      return {
        _tag: "Left",
        left: {
          code: "invalid-scrape-request",
          message: "Streamline SVG requests require a valid icon hash",
          retryable: false,
        },
      };
    }

    if (this.env.STREAMLINE_API_KEY.trim().length === 0) {
      return {
        _tag: "Left",
        left: {
          code: "provider-configuration-error",
          message: "STREAMLINE_API_KEY is required for Streamline requests",
          retryable: false,
        },
      };
    }

    try {
      const iconResponse = await fetch(
        `https://public-api.streamlinehq.com/v1/icons/${encodeURIComponent(normalizedHash)}`,
        { headers: { "x-api-key": this.env.STREAMLINE_API_KEY } },
      );

      if (!iconResponse.ok) {
        return {
          _tag: "Left",
          left: {
            code: iconResponse.status >= 500 ? "scrape-transient-failure" : "file-unavailable",
            message: `Streamline icon details failed with HTTP ${iconResponse.status}`,
            retryable: iconResponse.status >= 500,
          },
        };
      }

      const iconResponseJson: unknown = await iconResponse.json();
      const decodedIcon = Schema.decodeUnknownEither(StreamlineIconResponse)(iconResponseJson, {
        onExcessProperty: "ignore",
      });

      if (Either.isLeft(decodedIcon)) {
        return {
          _tag: "Left",
          left: {
            code: "unsupported-page-shape",
            message: "Streamline icon details returned an unsupported response shape",
            retryable: false,
          },
        };
      }

      const svgUrl = new URL(
        `https://public-api.streamlinehq.com/v1/icons/${encodeURIComponent(normalizedHash)}/download/svg`,
      );
      svgUrl.searchParams.set("size", "48");
      svgUrl.searchParams.set("responsive", "true");
      svgUrl.searchParams.set("strokeToFill", "false");

      const svgResponse = await fetch(svgUrl, {
        headers: { "x-api-key": this.env.STREAMLINE_API_KEY },
      });

      if (!svgResponse.ok) {
        return {
          _tag: "Left",
          left: {
            code: svgResponse.status >= 500 ? "scrape-transient-failure" : "file-unavailable",
            message: `Streamline SVG download failed with HTTP ${svgResponse.status}`,
            retryable: svgResponse.status >= 500,
          },
        };
      }

      const svg = await svgResponse.text();
      if (!svg.trimStart().startsWith("<svg")) {
        return {
          _tag: "Left",
          left: {
            code: "unsupported-page-shape",
            message: "Streamline SVG download did not return SVG markup",
            retryable: false,
          },
        };
      }

      return {
        _tag: "Right",
        right: {
          hash: decodedIcon.right.hash,
          name: decodedIcon.right.name,
          svg,
        },
      };
    } catch (cause) {
      return {
        _tag: "Left",
        left: {
          code: "scrape-transient-failure",
          message: `Streamline SVG request failed: ${String(cause)}`,
          retryable: true,
        },
      };
    }
  }
}
