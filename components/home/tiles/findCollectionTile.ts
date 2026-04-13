import { collectionsHash } from "@/components/home/tiles/collectionsHash";
import type { ICollectionTile, ICollectionTileDef } from "@/components/home/tiles/types";

/** Resolve a catalog entry by `collectionName` and tile variant `name` (tile record key). */
export function findCollectionTile(def: ICollectionTileDef): ICollectionTile | undefined {
  const collection = collectionsHash[def.collectionName as keyof typeof collectionsHash];
  if (!collection) return undefined;
  return collection.tiles[def.name as keyof typeof collection.tiles] as ICollectionTile | undefined;
}
