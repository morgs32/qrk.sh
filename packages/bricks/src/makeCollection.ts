import { mapValues } from "es-toolkit/object";

import type { ICollection, IBrick } from "./types";

export function makeCollection(props: {
  collectionName: string;
  collectionLabel: string;
  collectionDescription: string;
  variants: Record<string, { sizes: Record<string, IBrick> }>;
}): ICollection {
  const { collectionName, collectionLabel, collectionDescription, variants: rawVariants } = props;

  const variants = mapValues(rawVariants, (rawVariant) => {
    return {
      sizes: mapValues(rawVariant.sizes, (brick) => {
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
      }),
    };
  });

  return {
    collectionName,
    collectionLabel,
    collectionDescription,
    variants,
  };
}
