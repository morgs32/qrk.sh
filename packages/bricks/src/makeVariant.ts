import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";
import type { ReactNode } from "react";
import type { IJsonValue } from "./scraper/types.public";

import type { IFormConfiguration } from "./makeFormConfiguration";
import { makeFetcherConfiguration } from "./makeFetcherConfiguration";

import type { IBrick } from "./types";

export function makeVariant<
  const VARIANT extends string,
  const PAYLOAD_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
  const LAYOUTS extends Record<string, IBrick<VARIANT, string, (props: never) => ReactNode>>,
>(
  props: {
    variant: VARIANT;
    variantName: string;
    variantDescription: string;
    layouts: LAYOUTS & {
      [LAYOUT in keyof LAYOUTS]: LAYOUTS[LAYOUT] & {
        def: { variant: VARIANT; layout: LAYOUT & string };
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
        layouts: {
          [LAYOUT in keyof LAYOUTS]: {
            component: (props: { breakpoint: "xs" | "sm" | "md" | "lg" }) => ReactNode;
          };
        };
      }
    | {
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        configuration?:
          | ReturnType<typeof makeFetcherConfiguration<PAYLOAD_SHAPE>>
          | IFormConfiguration<InferDecodedRow<DATA_SHAPE>>;
        layouts: {
          [LAYOUT in keyof LAYOUTS]: {
            component: (props: {
              data: InferDecodedRow<DATA_SHAPE>;
              breakpoint: "xs" | "sm" | "md" | "lg";
            }) => ReactNode;
          };
        };
      }
  ),
) {
  if (props.dataShape === null) {
    return {
      variantName: props.variantName,
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
      layouts: props.layouts,
    };
  }

  const dataSchema = makeEffectSchema(props.dataShape);
  const decodedDataSchema = Schema.toType(dataSchema);
  const defaultData = Schema.decodeUnknownSync(decodedDataSchema)(props.defaultData, {
    onExcessProperty: "preserve",
  });
  if (props.configuration?.configurationType === "form") {
    return {
      variantName: props.variantName,
      variantDescription: props.variantDescription,
      dataShape: props.dataShape,
      defaultData,
      configuration: props.configuration,
      layouts: props.layouts,
    };
  }
  const fetcher = props.configuration?.fetcher;
  if (props.configuration === undefined || fetcher === undefined) {
    return {
      variantName: props.variantName,
      variantDescription: props.variantDescription,
      dataShape: props.dataShape,
      defaultData,
      configuration: undefined,
      layouts: props.layouts,
    };
  }

  return {
    variantName: props.variantName,
    variantDescription: props.variantDescription,
    dataShape: props.dataShape,
    defaultData,
    configuration: props.configuration,
    layouts: props.layouts,
  };
}
