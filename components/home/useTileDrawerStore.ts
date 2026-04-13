import { create } from "zustand";
import type { ICollectionTileDef } from "@/components/home/tiles/types";

export const TILE_DRAG_MIME = "application/x-qrk-tile-def";

type TileDrawerDragState = {
  activeTileDragGridShape: { w: number; h: number } | null;
  registerActiveTileDragGridShape: (w: number, h: number) => void;
  unregisterActiveTileDragGridShape: () => void;
};

export const useTileDrawerStore = create<TileDrawerDragState>((set) => ({
  activeTileDragGridShape: null,
  registerActiveTileDragGridShape: (w, h) => set({ activeTileDragGridShape: { w, h } }),
  unregisterActiveTileDragGridShape: () => set({ activeTileDragGridShape: null }),
}));

/**
 * Browsers often omit custom `getData` payloads during `dragover`; only `dragstart`/`drop` see them.
 * Register `def.w` / `def.h` on drag start so the grid drop placeholder can size before drop.
 */
export function getActiveTileDragGridShape(): { w: number; h: number } | null {
  return useTileDrawerStore.getState().activeTileDragGridShape;
}

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
