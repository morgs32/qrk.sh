import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";
import type { ReactNode } from "react";
import type { IJsonValue } from "./scraper/types.public";

import type { IFormConfiguration } from "./makeFormConfiguration";
import { makeFetcherConfiguration } from "./makeFetcherConfiguration";

import { mapValues } from "es-toolkit/object";
import type { makeView } from "./makeView";

export function makeContent<
  const CONTENT extends string,
  const CONTENT_OPTIONS_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
  const VIEWS extends Record<string, Omit<ReturnType<typeof makeView>, "component"> & {
    component: (props: never) => ReactNode;
  }>,
>(
  props: {
    content: CONTENT;
    contentName: string;
    contentDescription: string;
    views: VIEWS & {
      [VIEW in keyof VIEWS]: VIEWS[VIEW] & {
        id: VIEW & string;
      };
    };
  } & (
    | {
        dataShape: null;
        defaultData: null;
        configuration?: never;
        views: {
          [VIEW in keyof VIEWS]: {
            component: (props: { breakpoint: "xs" | "sm" | "md" | "lg" }) => ReactNode;
          };
        };
      }
    | {
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        configuration?:
          | ReturnType<typeof makeFetcherConfiguration<CONTENT_OPTIONS_SHAPE>>
          | IFormConfiguration<InferDecodedRow<DATA_SHAPE>>;
        views: {
          [VIEW in keyof VIEWS]: {
            component: (props: {
              data: InferDecodedRow<DATA_SHAPE>;
              breakpoint: "xs" | "sm" | "md" | "lg";
            }) => ReactNode;
          };
        };
      }
  ),
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(props.content)) {
    throw new Error(`makeContent: content must be kebab-case; got ${JSON.stringify(props.content)}`);
  }
  const views = mapValues(props.views, (view, key) => {
    if (key !== view.id) {
      throw new Error(`makeContent: view key ${JSON.stringify(key)} must match id ${JSON.stringify(view.id)}`);
    }
    return {
      def: {
        content: props.content,
        view: view.id,
        w: view.w,
        h: view.h,
        label: view.label,
        order: view.order,
      },
      component: view.component,
    };
  });

  if (props.dataShape === null) {
    return {
      contentName: props.contentName,
      contentDescription: props.contentDescription,
      dataShape: props.dataShape,
      defaultData: null,
      configuration: undefined,
      views,
    };
  }

  const dataSchema = makeEffectSchema(props.dataShape);
  const decodedDataSchema = Schema.toType(dataSchema);
  const defaultData = Schema.decodeUnknownSync(decodedDataSchema)(props.defaultData, {
    onExcessProperty: "preserve",
  });
  if (props.configuration?.configurationType === "form") {
    return {
      contentName: props.contentName,
      contentDescription: props.contentDescription,
      dataShape: props.dataShape,
      defaultData,
      configuration: props.configuration,
      views,
    };
  }
  if (props.configuration === undefined) {
    return {
      contentName: props.contentName,
      contentDescription: props.contentDescription,
      dataShape: props.dataShape,
      defaultData,
      configuration: undefined,
      views,
    };
  }

  return {
    contentName: props.contentName,
    contentDescription: props.contentDescription,
    dataShape: props.dataShape,
    defaultData,
    configuration: props.configuration,
    views,
  };
}
