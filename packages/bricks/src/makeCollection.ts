import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import { mapValues } from "es-toolkit/object";
import type { IShape } from "@zerospin/schema";
import type { ReactNode } from "react";

import type { ICollection, IBrick } from "./types";

export function makeCollection(props: {
  collectionName: string;
  collectionLabel: string;
  collectionDescription: string;
  variants: Record<
    string,
    | {
        variantName: string;
        variantDescription: string;
        configuration?: IFetcherConfiguration & { fetcher?: never };
        dataShape: null;
        defaultData: null;
        layouts: Record<string, IBrick<string, string, (props: never) => ReactNode>>;
      }
    | {
        variantName: string;
        variantDescription: string;
        configuration?:
          | IFormConfiguration
          | (IFetcherConfiguration & {
              fetcher: NonNullable<IFetcherConfiguration["fetcher"]>;
            });
        dataShape: IShape;
        defaultData: unknown;
        layouts: Record<string, IBrick<string, string, (props: never) => ReactNode>>;
      }
  >;
}): ICollection {
  const { collectionName, collectionLabel, collectionDescription, variants: rawVariants } = props;

  const variants = mapValues(rawVariants, (rawVariant) => {
    const layouts = mapValues(rawVariant.layouts, (brick) => {
      return {
        def: {
          collectionName,
          collectionLabel,
          variant: brick.def.variant,
          layout: brick.def.layout,
          w: brick.def.w,
          h: brick.def.h,
          label: brick.def.label,
          order: brick.def.order,
          data: rawVariant.defaultData,
        },
        component: brick.component,
      };
    });

    if (rawVariant.dataShape !== null) {
      return {
        variantName: rawVariant.variantName,
        variantDescription: rawVariant.variantDescription,
        configuration: rawVariant.configuration,
        dataShape: rawVariant.dataShape,
        defaultData: rawVariant.defaultData,
        layouts,
      };
    }
    if (rawVariant.configuration !== undefined) {
      return {
        variantName: rawVariant.variantName,
        variantDescription: rawVariant.variantDescription,
        configuration: rawVariant.configuration,
        dataShape: rawVariant.dataShape,
        defaultData: rawVariant.defaultData,
        layouts,
      };
    }
    return {
      variantName: rawVariant.variantName,
      variantDescription: rawVariant.variantDescription,
      dataShape: rawVariant.dataShape,
      defaultData: rawVariant.defaultData,
      layouts,
    };
  });

  return {
    collectionName,
    collectionLabel,
    collectionDescription,
    variants,
  };
}
