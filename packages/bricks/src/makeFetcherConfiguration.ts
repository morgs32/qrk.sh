import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { Effect, Schema } from "effect";
import type { ReactNode } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IJsonValue, IRpcEither } from "scraper/types";

/** Owns request configuration and decodes payloads before calling the provider. */
export function makeFetcherConfiguration<const PAYLOAD_SHAPE extends IShape>(props: {
  payloadShape: PAYLOAD_SHAPE;
  payloadForm?: {
    [FIELD in keyof PAYLOAD_SHAPE]?: PAYLOAD_SHAPE[FIELD] extends {
      defaultValue?: infer DEFAULT_VALUE;
    }
      ? undefined extends DEFAULT_VALUE
        ? never
        : (props: {
            value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD];
            onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD]) => void;
          }) => ReactNode
      : never;
  };
  fetcher?: never;
}): {
  payloadShape: PAYLOAD_SHAPE;
  payloadForm?: {
    [FIELD in keyof PAYLOAD_SHAPE]?: PAYLOAD_SHAPE[FIELD] extends {
      defaultValue?: infer DEFAULT_VALUE;
    }
      ? undefined extends DEFAULT_VALUE
        ? never
        : (props: {
            value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD];
            onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD]) => void;
          }) => ReactNode
      : never;
  };
};
export function makeFetcherConfiguration<const PAYLOAD_SHAPE extends IShape>(props: {
  payloadShape: PAYLOAD_SHAPE;
  payloadForm?: {
    [FIELD in keyof PAYLOAD_SHAPE]?: PAYLOAD_SHAPE[FIELD] extends {
      defaultValue?: infer DEFAULT_VALUE;
    }
      ? undefined extends DEFAULT_VALUE
        ? never
        : (props: {
            value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD];
            onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD]) => void;
          }) => ReactNode
      : never;
  };
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    payload: InferDecodedRow<PAYLOAD_SHAPE>;
  }) => Promise<IRpcEither<IJsonValue>>;
}): {
  payloadShape: PAYLOAD_SHAPE;
  payloadForm?: {
    [FIELD in keyof PAYLOAD_SHAPE]?: PAYLOAD_SHAPE[FIELD] extends {
      defaultValue?: infer DEFAULT_VALUE;
    }
      ? undefined extends DEFAULT_VALUE
        ? never
        : (props: {
            value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD];
            onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD]) => void;
          }) => ReactNode
      : never;
  };
  fetcher: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    payload: unknown;
  }) => Promise<IRpcEither<IJsonValue>>;
};

export function makeFetcherConfiguration<const PAYLOAD_SHAPE extends IShape>(props: {
  payloadShape: PAYLOAD_SHAPE;
  payloadForm?: {
    [FIELD in keyof PAYLOAD_SHAPE]?: PAYLOAD_SHAPE[FIELD] extends {
      defaultValue?: infer DEFAULT_VALUE;
    }
      ? undefined extends DEFAULT_VALUE
        ? never
        : (props: {
            value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD];
            onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>[FIELD]) => void;
          }) => ReactNode
      : never;
  };
  fetcher?: (props: {
    api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
    payload: InferDecodedRow<PAYLOAD_SHAPE>;
  }) => Promise<IRpcEither<IJsonValue>>;
}): object {
  if (props.fetcher === undefined) {
    return { payloadShape: props.payloadShape, payloadForm: props.payloadForm };
  }
  const fetcher = props.fetcher;
  const payloadSchema = makeEffectSchema(props.payloadShape);

  return {
    payloadShape: props.payloadShape,
    payloadForm: props.payloadForm,
    fetcher: async (request: {
      api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
      payload: unknown;
    }) => {
      const payload = await Effect.runPromise(
        Schema.decodeUnknownEffect(payloadSchema)(request.payload, {
          onExcessProperty: "error",
        }),
      );
      return fetcher({ api: request.api, payload });
    },
  };
}
