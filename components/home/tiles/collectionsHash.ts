import { homepageCatalogCollections } from "./homepageTileCollections";
import type { ICollectionTile } from "./types";

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
