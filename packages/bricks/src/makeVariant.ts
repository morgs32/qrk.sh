import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import type { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { Effect, Schema } from "effect";
import type { ReactNode } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IJsonValue, IRpcEither } from "scraper/types";

import { makeFetcherConfiguration } from "./makeFetcherConfiguration";

import type { IBrick } from "./types";

export function makeVariant<
  const VARIANT extends string,
  const PAYLOAD_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
  const SIZES extends Record<string, IBrick<VARIANT, string, (props: never) => ReactNode>>,
>(
  props: {
    variant: VARIANT;
    variantLabel: string;
    variantDescription: string;
    sizes: SIZES & {
      [SIZE in keyof SIZES]: SIZES[SIZE] & {
        def: { variant: VARIANT; size: SIZE & string };
      };
    };
  } & (
    | {
        dataShape: null;
        defaultData: null;
        configuration?: Pick<
          ReturnType<typeof makeFetcherConfiguration<PAYLOAD_SHAPE>>,
          "payloadShape" | "payloadForm"
        > & {
          fetcher?: never;
        };
        sizes: { [SIZE in keyof SIZES]: { component: () => ReactNode } };
      }
    | {
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        configuration?: ReturnType<typeof makeFetcherConfiguration<PAYLOAD_SHAPE>>;
        sizes: {
          [SIZE in keyof SIZES]: {
            component: (props: { data: InferDecodedRow<DATA_SHAPE> }) => ReactNode;
          };
        };
      }
  ),
) {
  if (props.dataShape === null) {
    return {
      variantLabel: props.variantLabel,
      variantDescription: props.variantDescription,
      dataShape: props.dataShape,
      defaultData: null,
      configuration:
        props.configuration === undefined
          ? undefined
          : {
              payloadShape: props.configuration.payloadShape,
              payloadForm: props.configuration.payloadForm,
            },
      sizes: props.sizes,
    };
  }

  const dataSchema = makeEffectSchema(props.dataShape);
  const decodedDataSchema = Schema.toType(dataSchema);
  const defaultData = Schema.decodeUnknownSync(decodedDataSchema)(props.defaultData, {
    onExcessProperty: "preserve",
  });
  const fetcher = props.configuration?.fetcher;
  if (props.configuration === undefined || fetcher === undefined) {
    return {
      variantLabel: props.variantLabel,
      variantDescription: props.variantDescription,
      dataShape: props.dataShape,
      defaultData,
      configuration: undefined,
      sizes: props.sizes,
    };
  }

  return {
    variantLabel: props.variantLabel,
    variantDescription: props.variantDescription,
    dataShape: props.dataShape,
    defaultData,
    configuration: {
      payloadShape: props.configuration.payloadShape,
      payloadForm: props.configuration.payloadForm,
      fetcher: async (request: {
        api: ReturnType<typeof newSyncRpcSession<ScraperApi>>;
        payload: unknown;
      }): Promise<IRpcEither<InferDecodedRow<DATA_SHAPE>>> => {
        const result = await fetcher(request);
        if (result._tag === "Left") {
          return result;
        }
        const data = await Effect.runPromise(
          Schema.decodeUnknownEffect(decodedDataSchema)(result.right, {
            onExcessProperty: "preserve",
          }),
        );
        return { _tag: "Right", right: data };
      },
    },
    sizes: props.sizes,
  };
}
