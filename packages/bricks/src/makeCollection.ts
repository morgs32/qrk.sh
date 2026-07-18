import { mapValues } from "es-toolkit/object";
import type { IShape } from "@zerospin/core/models/types";
import type { ReactNode } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IRpcEither } from "scraper/types";

import type { ICollection, IBrick } from "./types";

export function makeCollection(props: {
  collectionName: string;
  collectionLabel: string;
  collectionDescription: string;
  variants: Record<
    string,
    | {
        variantDescription: string;
        payloadShape?: never;
        dataShape?: never;
        defaultData?: never;
        getData?: never;
        sizes: Record<string, IBrick<string, string, (props: never) => ReactNode>>;
      }
    | {
        variantDescription: string;
        payloadShape: IShape;
        dataShape: IShape;
        defaultData: unknown;
        getData: (props: { api: ScraperApi; payload: unknown }) => Promise<IRpcEither<unknown>>;
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
        },
        component: brick.component,
      };
    });

    if (
      rawVariant.payloadShape !== undefined &&
      rawVariant.dataShape !== undefined &&
      rawVariant.defaultData !== undefined &&
      rawVariant.getData !== undefined
    ) {
      return {
        variantDescription: rawVariant.variantDescription,
        payloadShape: rawVariant.payloadShape,
        dataShape: rawVariant.dataShape,
        defaultData: rawVariant.defaultData,
        getData: rawVariant.getData,
        sizes,
      };
    }

    return {
      variantDescription: rawVariant.variantDescription,
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
