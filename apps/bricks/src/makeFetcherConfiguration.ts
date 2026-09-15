import type { ReactNode } from "react";

import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Effect, Schema } from "effect";

import type { ScraperApi } from "./scraper/ScraperApi.public";
import type { IRpcEither } from "./scraper/types.public";

/** Runtime configuration contract after the factory has decoded its catalogOptions. */
export interface IFetcherConfiguration {
  configurationType: "fetcher";
  catalogOptionsShape: IShape;
  catalogOptionsForm?: {
    bivarianceHack(props: {
      value: Record<string, unknown>;
      onChange: {
        bivarianceHack(value: Record<string, unknown>): void;
      }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    catalogOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}

/** Owns request configuration and decodes catalog options before calling the provider. */
export function makeFetcherConfiguration<const CATALOG_OPTIONS_SHAPE extends IShape>(props: {
  catalogOptionsShape: CATALOG_OPTIONS_SHAPE;
  catalogOptionsForm?: (props: {
    value: InferDecodedRow<CATALOG_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<CATALOG_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    catalogOptions: InferDecodedRow<CATALOG_OPTIONS_SHAPE>;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}): {
  configurationType: "fetcher";
  catalogOptionsShape: CATALOG_OPTIONS_SHAPE;
  catalogOptionsForm?: (props: {
    value: InferDecodedRow<CATALOG_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<CATALOG_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    catalogOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
} {
  const fetcher = props.fetcher;
  const catalogOptionsSchema = makeEffectSchema(props.catalogOptionsShape);

  return {
    configurationType: "fetcher",
    catalogOptionsShape: props.catalogOptionsShape,
    catalogOptionsForm: props.catalogOptionsForm,
    fetcher: async (request: {
      api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
      catalogOptions: unknown;
      setData: (data: unknown) => void;
    }) => {
      const catalogOptions = await Effect.runPromise(
        Schema.decodeUnknownEffect(catalogOptionsSchema)(request.catalogOptions, {
          onExcessProperty: "error",
        }),
      );
      return fetcher({
        api: request.api,
        catalogOptions,
        setData: request.setData,
      });
    },
  };
}
