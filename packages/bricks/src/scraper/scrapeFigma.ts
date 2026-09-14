import { Effect, Schema } from "effect";

import { ScrapeError } from "./ScrapeError";
import { FigmaFilePreviewPayloadSchema } from "./schemas";
import type { IFigmaFilePreviewPayload } from "./types";

export const parseFigmaFilePreviewPayload = Effect.fn("parseFigmaFilePreviewPayload")(
  function* (props: { payload: unknown; canonicalUrl: string }) {
    const payload = yield* Schema.decodeUnknownEffect(FigmaFilePreviewPayloadSchema)(
      props.payload,
      {
        onExcessProperty: "preserve",
      },
    ).pipe(
      Effect.mapError(
        () =>
          new ScrapeError({
            code: "unsupported-page-shape",
            message: "Figma returned unsupported oEmbed metadata",
          }),
      ),
    );

    if (payload.title.trim().length === 0) {
      return yield* new ScrapeError({
        code: "unsupported-page-shape",
        message: "Figma returned oEmbed metadata without a title",
      });
    }

    if (payload.url.trim().length === 0) {
      return yield* new ScrapeError({
        code: "unsupported-page-shape",
        message: "Figma returned oEmbed metadata without a canonical URL",
      });
    }

    const preview: IFigmaFilePreviewPayload = {
      ...payload,
      title: payload.title,
      url: props.canonicalUrl,
      thumbnail_url: payload.thumbnail_url ?? null,
      thumbnail_width: payload.thumbnail_width ?? null,
      thumbnail_height: payload.thumbnail_height ?? null,
    };

    return preview;
  },
);

export const scrapeFigma = Effect.fn("scrapeFigma")(function* (props: {
  url: string;
  token: string;
}) {
  if (typeof props.token !== "string" || props.token.trim().length === 0) {
    return yield* new ScrapeError({
      code: "provider-configuration-error",
      message: "FIGMA_TOKEN is missing. Configure a Figma token with file_metadata:read access.",
    });
  }

  const endpoint = new URL("https://api.figma.com/v1/oembed");
  endpoint.searchParams.set("url", props.url);

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(endpoint, {
        headers: {
          accept: "application/json",
          "X-Figma-Token": props.token,
        },
      }),
    catch: (cause) =>
      new ScrapeError({
        code: "scrape-transient-failure",
        message: `Figma request failed: ${String(cause)}`,
        retryable: true,
      }),
  });

  if (response.status === 429 || response.status >= 500) {
    return yield* new ScrapeError({
      code: "scrape-transient-failure",
      message: `Figma returned HTTP ${response.status}`,
      retryable: true,
    });
  }

  if (response.status === 401 || response.status === 403) {
    return yield* new ScrapeError({
      code: "provider-configuration-error",
      message:
        response.status === 401
          ? "Figma returned HTTP 401: authentication failed. Check whether FIGMA_TOKEN is valid or expired."
          : "Figma returned HTTP 403: access denied. Check the token's file_metadata:read scope and access permissions.",
    });
  }

  if (response.status === 404) {
    return yield* new ScrapeError({
      code: "file-unavailable",
      message:
        "Figma returned HTTP 404: the file was not found or does not have public link access.",
    });
  }

  if (!response.ok) {
    return yield* new ScrapeError({
      code: response.status === 400 ? "invalid-scrape-request" : "provider-configuration-error",
      message: `Figma rejected the oEmbed request with HTTP ${response.status}.`,
    });
  }

  const payload = yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: () =>
      new ScrapeError({
        code: "unsupported-page-shape",
        message: "Figma returned malformed JSON",
      }),
  });

  return yield* parseFigmaFilePreviewPayload({ payload, canonicalUrl: props.url });
});
