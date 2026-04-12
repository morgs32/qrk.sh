import { homepageCatalogCollections, homepageTileCollections } from "./homepageTileCollections";
import type { ICollectionTile, ICollectionTileDef } from "./types";
import { tileDefsEqual } from "./types";

export type { ICollectionTile, ICollectionTileDef, ITile, ITileVariantDef } from "./types";
export { catalogKey, tileDefsEqual } from "./types";
export { makeTile } from "./makeTile";
export { makeCollection, type MapToCollectionTiles } from "./makeCollection";

export { homepageCatalogCollections, homepageTileCollections } from "./homepageTileCollections";

/** Lookup by `collectionName` (kebab-case slug). Key order matches `homepageCatalogCollections`. */
export const collectionsHash: Record<
  string,
  { tiles: Readonly<Record<string, ICollectionTile>> }
> = Object.fromEntries(
  homepageCatalogCollections.map((col) => {
    const first = Object.values(col.tiles)[0]!;
    const collectionName = first.def.collectionName;
    return [collectionName, { tiles: col.tiles }];
  }),
);

export const homepageTiles: ICollectionTile[] = homepageTileCollections.flat();

/** Resolve a catalog entry by structural match on `def` (same contract as grid seed / drag). */
export function findCollectionTile(def: ICollectionTileDef): ICollectionTile | undefined {
  return homepageTiles.find((tile) => tileDefsEqual(tile.def, def));
}
