import { homepageTileCollections } from "./homepageTileCollections";
import type { ICollectionTile, ICollectionTileDef } from "./types";
import { tileDefsEqual } from "./types";

export type { ICollectionTile, ICollectionTileDef, ITile, ITileVariantDef } from "./types";
export { catalogKey, tileDefsEqual } from "./types";
export { makeTile } from "./makeTile";
export { makeTileCollection } from "./makeTileCollection";

export const homepageTiles: ICollectionTile[] = homepageTileCollections.flat();

/** Resolve a catalog entry by structural match on `def` (same contract as grid seed / drag). */
export function findCollectionTile(def: ICollectionTileDef): ICollectionTile | undefined {
  return homepageTiles.find((tile) => tileDefsEqual(tile.def, def));
}
