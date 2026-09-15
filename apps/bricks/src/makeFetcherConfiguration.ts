import type { ReactNode } from "react";

import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Effect, Schema } from "effect";

import type { ScraperApi } from "./scraper/ScraperApi.public";
import type { IRpcEither } from "./scraper/types.public";

/** Runtime configuration contract after the factory has decoded its registryOptions. */
export interface IFetcherConfiguration {
  configurationType: "fetcher";
  registryOptionsShape: IShape;
  registryOptionsForm?: {
    bivarianceHack(props: {
      value: Record<string, unknown>;
      onChange: {
        bivarianceHack(value: Record<string, unknown>): void;
      }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    registryOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}

/** Owns request configuration and decodes registry options before calling the provider. */
export function makeFetcherConfiguration<const REGISTRY_OPTIONS_SHAPE extends IShape>(props: {
  registryOptionsShape: REGISTRY_OPTIONS_SHAPE;
  registryOptionsForm?: (props: {
    value: InferDecodedRow<REGISTRY_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<REGISTRY_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    registryOptions: InferDecodedRow<REGISTRY_OPTIONS_SHAPE>;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}): {
  configurationType: "fetcher";
  registryOptionsShape: REGISTRY_OPTIONS_SHAPE;
  registryOptionsForm?: (props: {
    value: InferDecodedRow<REGISTRY_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<REGISTRY_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    registryOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
} {
  const fetcher = props.fetcher;
  const registryOptionsSchema = makeEffectSchema(props.registryOptionsShape);

  return {
    configurationType: "fetcher",
    registryOptionsShape: props.registryOptionsShape,
    registryOptionsForm: props.registryOptionsForm,
    fetcher: async (request: {
      api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
      registryOptions: unknown;
      setData: (data: unknown) => void;
    }) => {
      const registryOptions = await Effect.runPromise(
        Schema.decodeUnknownEffect(registryOptionsSchema)(request.registryOptions, {
          onExcessProperty: "error",
        }),
      );
      return fetcher({
        api: request.api,
        registryOptions,
        setData: request.setData,
      });
    },
  };
}
