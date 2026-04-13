import { mapValues } from "es-toolkit/object";

import type { ICollection, ICollectionTile, ITile } from "./types";

export function makeCollection<const T extends Record<string, ITile>>(props: {
  collectionName: string;
  collectionLabel: string;
  tiles: T;
}): ICollection<T> {
  const { collectionName, collectionLabel, tiles: rawTiles } = props;

  const tiles = mapValues(rawTiles, (tile) => {
    const { def, component } = tile;
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
    [K in keyof T]: ICollectionTile<T[K]>;
  };

  return {
    collectionName,
    collectionLabel,
    tiles,
  };
}
