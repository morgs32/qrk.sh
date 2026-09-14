import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";
import type { ReactNode } from "react";
import type { IJsonValue } from "scraper/types";

import type { IFormConfiguration } from "./makeFormConfiguration";
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
          "configurationType" | "payloadShape" | "payloadForm"
        > & {
          fetcher?: never;
        };
        sizes: { [SIZE in keyof SIZES]: { component: () => ReactNode } };
      }
    | {
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        configuration?:
          | ReturnType<typeof makeFetcherConfiguration<PAYLOAD_SHAPE>>
          | IFormConfiguration<InferDecodedRow<DATA_SHAPE>>;
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
        props.configuration === undefined || props.configuration.configurationType !== "fetcher"
          ? undefined
          : {
              configurationType: props.configuration.configurationType,
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
  if (props.configuration?.configurationType === "form") {
    return {
      variantLabel: props.variantLabel,
      variantDescription: props.variantDescription,
      dataShape: props.dataShape,
      defaultData,
      configuration: props.configuration,
      sizes: props.sizes,
    };
  }
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
    configuration: props.configuration,
    sizes: props.sizes,
  };
}
