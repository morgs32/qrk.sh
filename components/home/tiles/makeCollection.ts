import { mapValues } from "es-toolkit/object";

import type { ICollectionTile, ITile } from "./types";

/** `ICollectionTile` row per variant key (same keys as the `tiles` object passed to `makeCollection`). */
export type MapToCollectionTiles<T extends Record<string, ITile>> = {
  readonly [K in keyof T]: ICollectionTile;
};

export function makeCollection<const T extends Record<string, ITile>>(props: {
  collectionName: string;
  collectionLabel: string;
  tiles: T;
}): {
  readonly tiles: MapToCollectionTiles<T>;
} {
  const { collectionName, collectionLabel, tiles } = props;

  const keys = Object.keys(tiles) as Extract<keyof T, string>[];

  for (const key of keys) {
    if (tiles[key].def.name !== key) {
      throw new Error(
        `makeCollection: tiles key ${JSON.stringify(key)} must equal tile.def.name ${JSON.stringify(tiles[key].def.name)}`,
      );
    }
  }

  return {
    tiles: mapValues(tiles, (tile) => {
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
    }) as MapToCollectionTiles<T>,
  };
}
