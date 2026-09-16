import type { ReactNode } from "react";

import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Effect, Schema } from "effect";

import type { LibraryApi } from "../worker/LibraryApi.public";
import type { IRpcEither } from "../worker/types.public";

/** Runtime configuration contract after the factory has decoded its moduleOptions. */
export interface IFetcherConfiguration {
  configurationType: "fetcher";
  moduleOptionsShape: IShape;
  moduleOptionsForm?: {
    bivarianceHack(props: {
      value: Record<string, unknown>;
      onChange: {
        bivarianceHack(value: Record<string, unknown>): void;
      }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    moduleOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}

/** Owns request configuration and decodes module options before calling the provider. */
export function makeFetcherConfiguration<const MODULE_OPTIONS_SHAPE extends IShape>(props: {
  moduleOptionsShape: MODULE_OPTIONS_SHAPE;
  moduleOptionsForm?: (props: {
    value: InferDecodedRow<MODULE_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<MODULE_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    moduleOptions: InferDecodedRow<MODULE_OPTIONS_SHAPE>;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}): {
  configurationType: "fetcher";
  moduleOptionsShape: MODULE_OPTIONS_SHAPE;
  moduleOptionsForm?: (props: {
    value: InferDecodedRow<MODULE_OPTIONS_SHAPE>;
    onChange: (value: InferDecodedRow<MODULE_OPTIONS_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    moduleOptions: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
} {
  const fetcher = props.fetcher;
  const moduleOptionsSchema = makeEffectSchema(props.moduleOptionsShape);

  return {
    configurationType: "fetcher",
    moduleOptionsShape: props.moduleOptionsShape,
    moduleOptionsForm: props.moduleOptionsForm,
    fetcher: async (request: {
      api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
      moduleOptions: unknown;
      setData: (data: unknown) => void;
    }) => {
      const moduleOptions = await Effect.runPromise(
        Schema.decodeUnknownEffect(moduleOptionsSchema)(request.moduleOptions, {
          onExcessProperty: "error"}),
      );
      return fetcher({
        api: request.api,
        moduleOptions,
        setData: request.setData});
    }};
}
