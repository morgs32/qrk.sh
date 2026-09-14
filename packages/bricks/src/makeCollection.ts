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
        variantLabel: string;
        variantDescription: string;
        configuration?: IFetcherConfiguration & { fetcher?: never };
        dataShape: null;
        defaultData: null;
        sizes: Record<string, IBrick<string, string, (props: never) => ReactNode>>;
      }
    | {
        variantLabel: string;
        variantDescription: string;
        configuration?: IFetcherConfiguration & {
          fetcher: NonNullable<IFetcherConfiguration["fetcher"]>;
        };
        dataShape: IShape;
        defaultData: unknown;
        sizes: Record<string, IBrick<string, string, (props: never) => ReactNode>>;
      }
  >;
}): ICollection {
  const { collectionName, collectionLabel, collectionDescription, variants: rawVariants } = props;

  const variants = mapValues(rawVariants, (rawVariant) => {
    const sizes = mapValues(rawVariant.sizes, (brick) => {
      return {
        def: {
          collectionName,
          collectionLabel,
          variant: brick.def.variant,
          size: brick.def.size,
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
        variantLabel: rawVariant.variantLabel,
        variantDescription: rawVariant.variantDescription,
        configuration: rawVariant.configuration,
        dataShape: rawVariant.dataShape,
        defaultData: rawVariant.defaultData,
        sizes,
      };
    }
    if (rawVariant.configuration !== undefined) {
      return {
        variantLabel: rawVariant.variantLabel,
        variantDescription: rawVariant.variantDescription,
        configuration: rawVariant.configuration,
        dataShape: rawVariant.dataShape,
        defaultData: rawVariant.defaultData,
        sizes,
      };
    }
    return {
      variantLabel: rawVariant.variantLabel,
      variantDescription: rawVariant.variantDescription,
      dataShape: rawVariant.dataShape,
      defaultData: rawVariant.defaultData,
      sizes,
    };
  });

  return {
    collectionName,
    collectionLabel,
    collectionDescription,
    variants,
  };
}
