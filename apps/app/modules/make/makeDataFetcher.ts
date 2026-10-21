import type { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema, type IInferDecodedRow, type IShape } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import type { LibraryApi } from "@qrk.sh/api/modules/LibraryApi.public";
import type { IJsonValue } from "@qrk.sh/zerospin/src/modules/types";
import type { IRpcEither } from "@qrk.sh/api/modules/types";
import { decodeDefaultData } from "@qrk.sh/zerospin/src/modules/make/decodeDefaultData";

/** Owns request payload decoding before calling the provider fetcher. */
export function makeDataFetcher<
  const PAYLOAD_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
>(props: {
  payloadShape: PAYLOAD_SHAPE;
  dataShape: DATA_SHAPE;
  defaultData: IInferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
  fetcher?: (props: {
    api: ReturnType<typeof newSyncRpcSession<LibraryApi>>;
    payload: IInferDecodedRow<PAYLOAD_SHAPE>;
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
