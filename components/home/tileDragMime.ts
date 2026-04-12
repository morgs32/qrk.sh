import type { ICollectionTileDef } from "@/components/home/tiles/types";

export const TILE_DRAG_MIME = "application/x-qrk-tile-def";

export function parseTileDefFromDataTransfer(dt: DataTransfer | null): ICollectionTileDef | null {
  if (!dt) {
    return null;
  }
  const raw = dt.getData(TILE_DRAG_MIME);
  if (!raw) {
    return null;
  }
  try {
    const v = JSON.parse(raw) as ICollectionTileDef;
    if (
      typeof v.collectionName === "string" &&
      typeof v.collectionLabel === "string" &&
      typeof v.label === "string" &&
      typeof v.name === "string" &&
      typeof v.order === "number" &&
      typeof v.w === "number" &&
      typeof v.h === "number"
    ) {
      return v;
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
}
