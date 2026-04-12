import { homepageTiles } from "./homepageTiles";
import type { ICollectionTile, ICollectionTileDef } from "./types";
import { tileDefsEqual } from "./types";

/** Resolve a catalog entry by structural match on `def` (same contract as grid seed / drag). */
export function findCollectionTile(def: ICollectionTileDef): ICollectionTile | undefined {
  return homepageTiles.find((tile) => tileDefsEqual(tile.def, def));
}
