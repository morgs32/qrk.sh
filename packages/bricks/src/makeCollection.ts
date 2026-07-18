import { mapValues } from "es-toolkit/object";
import type { IShape } from "@zerospin/core/models/types";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IJsonValue, IRpcEither } from "scraper/types";

import type { ICollection, IBrick } from "./types";

export function makeCollection(props: {
  collectionName: string;
  collectionLabel: string;
  collectionDescription: string;
  variants: Record<
    string,
    | {
        variantDescription: string;
        payload?: never;
        getData?: never;
        sizes: Record<string, IBrick>;
      }
    | {
        variantDescription: string;
        payload: IShape;
        getData: (props: { api: ScraperApi; payload: unknown }) => Promise<IRpcEither<IJsonValue>>;
        sizes: Record<string, IBrick>;
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

    if (rawVariant.payload !== undefined && rawVariant.getData !== undefined) {
      return {
        variantDescription: rawVariant.variantDescription,
        payload: rawVariant.payload,
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
