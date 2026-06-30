import { mapValues } from "es-toolkit/object";

import type { ICollection, ICollectionBrick, IBrick } from "./types";

export function makeCollection<const T extends Record<string, IBrick>>(props: {
  collectionName: string;
  collectionLabel: string;
  bricks: T;
}): ICollection<T> {
  const { collectionName, collectionLabel, bricks: rawBricks } = props;

  const bricks = mapValues(rawBricks, (brick) => {
    const { def, component } = brick;
    return {
      def: {
        name: def.name,
        w: def.w,
        h: def.h,
        label: def.label ?? collectionLabel,
        collectionName,
        collectionLabel,
        order: def.order,
      },
      component,
    };
  }) as {
    [K in keyof T]: ICollectionBrick<T[K]>;
  };

  return {
    collectionName,
    collectionLabel,
    bricks,
  };
}
