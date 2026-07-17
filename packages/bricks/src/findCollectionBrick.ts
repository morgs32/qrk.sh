import { collectionsHash } from "./collectionsHash";
import type { ICollectionBrick, ICollectionBrickDef } from "./types";

/** Resolve a catalog entry by `collectionName` and brick variant `name` (brick record key). */
export function findCollectionBrick(def: ICollectionBrickDef): ICollectionBrick | undefined {
  const collection = collectionsHash[def.collectionName as keyof typeof collectionsHash];
  if (!collection) return undefined;
  return collection.bricks[def.name as keyof typeof collection.bricks] as
    | ICollectionBrick
    | undefined;
}
