import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Effect, Schema } from "effect";

import type { LibraryApi } from "../worker/LibraryApi.public";
import type { IJsonValue, IRpcEither } from "../worker/types.public";
import { decodeDefaultData } from "./decodeDefaultData";

/** Owns request payload decoding before calling the provider fetcher. */
export function makeDataFetcher<
  const PAYLOAD_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
>(props: {
  payloadShape: PAYLOAD_SHAPE;
  dataShape: DATA_SHAPE;
  defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
  fetcher?: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    payload: InferDecodedRow<PAYLOAD_SHAPE>;
    setData: (data: unknown) => void;
  }) => Promise<IRpcEither<void>>;
}) {
  const fetcher = props.fetcher;
  const payloadSchema = makeEffectSchema(props.payloadShape);

  return {
    dataType: "fetcher" as const,
    payloadShape: props.payloadShape,
    dataShape: props.dataShape,
    defaultData: decodeDefaultData(props.dataShape, props.defaultData),
    fetcher: async (request: {
      api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
      payload: unknown;
      setData: (data: unknown) => void;
    }) => {
      if (fetcher === undefined) {
        return { _tag: "Right" as const, right: undefined };
      }
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
