import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { Effect, Schema } from "effect";
import type { ReactNode } from "react";
import type { ScraperApi } from "./scraper/ScraperApi.public";
import type { IRpcEither } from "./scraper/types.public";

/** Runtime configuration contract after the factory has decoded its contentOptions. */
export interface IFetcherConfiguration {
  configurationType: "fetcher";
  contentOptionsShape: IShape;
  contentOptionsForm?: {
    bivarianceHack(props: {
      value: Record<string, unknown>;
      onChange: { bivarianceHack(value: Record<string, unknown>): void }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    contentOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}

/** Owns request configuration and decodes content options before calling the provider. */
export function makeFetcherConfiguration<const CONTENT_OPTIONS_SHAPE extends IShape>(props: {
  contentOptionsShape: CONTENT_OPTIONS_SHAPE;
  contentOptionsForm?: (props: {
    value: InferDecodedRow<CONTENT_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<CONTENT_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    contentOptions: InferDecodedRow<CONTENT_OPTIONS_SHAPE>;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}): {
  configurationType: "fetcher";
  contentOptionsShape: CONTENT_OPTIONS_SHAPE;
  contentOptionsForm?: (props: {
    value: InferDecodedRow<CONTENT_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<CONTENT_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    contentOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
} {
  const fetcher = props.fetcher;
  const contentOptionsSchema = makeEffectSchema(props.contentOptionsShape);

  return {
    configurationType: "fetcher",
    contentOptionsShape: props.contentOptionsShape,
    contentOptionsForm: props.contentOptionsForm,
    fetcher: async (request: {
      api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
      contentOptions: unknown;
      setData: (data: unknown) => void;
    }) => {
      const contentOptions = await Effect.runPromise(
        Schema.decodeUnknownEffect(contentOptionsSchema)(request.contentOptions, {
          onExcessProperty: "error",
        }),
      );
      return fetcher({ api: request.api, contentOptions, setData: request.setData });
    },
  };
}
