import { makeEffectSchema } from "@zerospin/core/models/primitiveMaps";
import type { IShape, InferDecodedRow } from "@zerospin/core/models/types";
import { Effect, Schema } from "effect";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IJsonValue, IRpcEither } from "scraper/types";

import type { IBrick } from "./types";

export function makeVariant<
  const VARIANT extends string,
  const SIZES extends Record<string, IBrick<VARIANT, string>>,
>(props: {
  variant: VARIANT;
  variantDescription: string;
  payload?: never;
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
  const SIZES extends Record<string, IBrick<VARIANT, string>>,
  const PAYLOAD extends IShape,
>(props: {
  variant: VARIANT;
  variantDescription: string;
  payload: PAYLOAD;
  getData: (props: {
    api: ScraperApi;
    payload: InferDecodedRow<PAYLOAD>;
  }) => Promise<IRpcEither<IJsonValue>>;
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
  payload: PAYLOAD;
  getData: (props: { api: ScraperApi; payload: unknown }) => Promise<IRpcEither<IJsonValue>>;
  sizes: SIZES;
};
export function makeVariant<
  const VARIANT extends string,
  const SIZES extends Record<string, IBrick<VARIANT, string>>,
  const PAYLOAD extends IShape,
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
        payload?: never;
        getData?: never;
      }
    | {
        payload: PAYLOAD;
        getData: (props: {
          api: ScraperApi;
          payload: InferDecodedRow<PAYLOAD>;
        }) => Promise<IRpcEither<IJsonValue>>;
      }
  ),
) {
  if (props.payload === undefined || props.getData === undefined) {
    return {
      variantDescription: props.variantDescription,
      sizes: props.sizes,
    };
  }

  const payloadSchema = makeEffectSchema(props.payload);

  return {
    variantDescription: props.variantDescription,
    payload: props.payload,
    getData: async (request: { api: ScraperApi; payload: unknown }) => {
      const decodedPayload = await Effect.runPromise(
        Schema.decodeUnknown(payloadSchema)(request.payload, {
          onExcessProperty: "error",
        }),
      );

      return props.getData({
        api: request.api,
        payload: decodedPayload,
      });
    },
    sizes: props.sizes,
  };
}
