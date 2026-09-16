import type { ReactNode } from "react";

import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Effect, Schema } from "effect";

import type { LibraryApi } from "../worker/LibraryApi.public";
import type { IRpcEither } from "../worker/types.public";

/** Runtime configuration contract after the factory has decoded its payload. */
export interface IFetcherConfiguration {
  configurationType: "fetcher";
  payloadShape: IShape;
  payloadForm?: {
    bivarianceHack(props: {
      value: Record<string, unknown>;
      onChange: {
        bivarianceHack(value: Record<string, unknown>): void;
      }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    payload: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}

/** Owns request configuration and decodes payload before calling the provider. */
export function makeFetcherConfiguration<const PAYLOAD_SHAPE extends IShape>(props: {
  payloadShape: PAYLOAD_SHAPE;
  payloadForm?: (props: {
    value: InferDecodedRow<PAYLOAD_SHAPE>;
    onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    payload: InferDecodedRow<PAYLOAD_SHAPE>;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}): {
  configurationType: "fetcher";
  payloadShape: PAYLOAD_SHAPE;
  payloadForm?: (props: {
    value: InferDecodedRow<PAYLOAD_SHAPE>;
    onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>) => void;
  }) => ReactNode;
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    payload: unknown;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
} {
  const fetcher = props.fetcher;
  const payloadSchema = makeEffectSchema(props.payloadShape);

  return {
    configurationType: "fetcher",
    payloadShape: props.payloadShape,
    payloadForm: props.payloadForm,
    fetcher: async (request: {
      api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
      payload: unknown;
      setData: (data: unknown) => void;
    }) => {
      const payload = await Effect.runPromise(
        Schema.decodeUnknownEffect(payloadSchema)(request.payload, {
          onExcessProperty: "error",
        }),
      );
      return fetcher({
        api: request.api,
        payload,
        setData: request.setData,
      });
    },
  };
}
