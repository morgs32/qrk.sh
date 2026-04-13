import type { ICollectionTileDef } from "./types";

/**
 * Stable id matching legacy `typeId` rules: 4×4 primary slot uses bare `collectionName`,
 * other variants use `${collectionName}--${w}x${h}`.
 */
export function catalogKey(def: ICollectionTileDef): string {
  if (def.w === 4 && def.h === 4) {
    return def.collectionName;
  }
  return `${def.collectionName}--${def.w}x${def.h}`;
}
