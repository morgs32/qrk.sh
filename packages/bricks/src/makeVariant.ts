import { makeEffectSchema } from "@zerospin/core/models/primitiveMaps";
import type { IShape, InferDecodedRow } from "@zerospin/core/models/types";
import { Effect, Schema } from "effect";
import type { ReactNode } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IJsonValue, IRpcEither } from "scraper/types";

import type { IBrick } from "./types";

export function makeVariant<
  const VARIANT extends string,
  const SIZES extends Record<string, IBrick<VARIANT, string, (props: never) => ReactNode>>,
>(props: {
  variant: VARIANT;
  variantDescription: string;
  payloadShape?: never;
  payloadForm?: never;
  dataShape?: never;
  defaultData?: never;
  getData?: never;
  sizes: SIZES & {
    [SIZE in keyof SIZES]: SIZES[SIZE] & {
      def: {
        variant: VARIANT;
        size: SIZE & string;
      };
    };
  };
}): {
  variantDescription: string;
  sizes: SIZES;
};
export function makeVariant<
  const VARIANT extends string,
  const PAYLOAD_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
  const SIZES extends Record<string, IBrick<VARIANT, string, (props: never) => ReactNode>>,
>(props: {
  variant: VARIANT;
  variantDescription: string;
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
  dataShape: DATA_SHAPE;
  defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
  getData: (props: {
    api: ScraperApi;
    payload: InferDecodedRow<PAYLOAD_SHAPE>;
  }) => Promise<IRpcEither<IJsonValue>>;
  sizes: SIZES & {
    [SIZE in keyof SIZES]: SIZES[SIZE] & {
      def: {
        variant: VARIANT;
        size: SIZE & string;
      };
      component: Parameters<SIZES[SIZE]["component"]> extends [
        { data: InferDecodedRow<DATA_SHAPE> },
        ...unknown[],
      ]
        ? (props: { data: InferDecodedRow<DATA_SHAPE> }) => ReactNode
        : never;
    };
  };
}): {
  variantDescription: string;
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
  dataShape: DATA_SHAPE;
  defaultData: InferDecodedRow<DATA_SHAPE>;
  getData: (props: {
    api: ScraperApi;
    payload: unknown;
  }) => Promise<IRpcEither<InferDecodedRow<DATA_SHAPE>>>;
  sizes: SIZES;
};
export function makeVariant<
  const VARIANT extends string,
  const SIZES extends Record<string, IBrick<VARIANT, string, (props: never) => ReactNode>>,
  const PAYLOAD_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
>(
  props: {
    variant: VARIANT;
    variantDescription: string;
    sizes: SIZES & {
      [SIZE in keyof SIZES]: SIZES[SIZE] & {
        def: {
          variant: VARIANT;
          size: SIZE & string;
        };
      };
    };
  } & (
    | {
        payloadShape?: never;
        payloadForm?: never;
        dataShape?: never;
        defaultData?: never;
        getData?: never;
      }
    | {
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
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        getData: (props: {
          api: ScraperApi;
          payload: InferDecodedRow<PAYLOAD_SHAPE>;
        }) => Promise<IRpcEither<IJsonValue>>;
      }
  ),
) {
  if (
    props.payloadShape === undefined ||
    props.dataShape === undefined ||
    props.defaultData === undefined ||
    props.getData === undefined
  ) {
    return {
      variantDescription: props.variantDescription,
      sizes: props.sizes,
    };
  }

  const payloadSchema = makeEffectSchema(props.payloadShape);
  const dataSchema = makeEffectSchema(props.dataShape);
  const defaultData = Schema.decodeUnknownSync(dataSchema)(props.defaultData, {
    onExcessProperty: "preserve",
  });

  return {
    variantDescription: props.variantDescription,
    payloadShape: props.payloadShape,
    payloadForm: props.payloadForm,
    dataShape: props.dataShape,
    defaultData,
    getData: async (request: { api: ScraperApi; payload: unknown }) => {
      const decodedPayload = await Effect.runPromise(
        Schema.decodeUnknown(payloadSchema)(request.payload, {
          onExcessProperty: "error",
        }),
      );

      const result = await props.getData({
        api: request.api,
        payload: decodedPayload,
      });

      if (result._tag === "Left") {
        return result;
      }

      const data = await Effect.runPromise(
        Schema.decodeUnknown(dataSchema)(result.right, {
          onExcessProperty: "preserve",
        }),
      );

      return { _tag: "Right", right: data };
    },
    sizes: props.sizes,
  };
}
