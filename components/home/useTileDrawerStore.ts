import { Either, Schema } from "effect";
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

const TileDragDefFromJsonStringSchema = Schema.parseJson(
  Schema.Struct({
    collectionName: Schema.String,
    collectionLabel: Schema.String,
    label: Schema.String,
    name: Schema.String,
    order: Schema.Number,
    w: Schema.Number,
    h: Schema.Number,
  }) satisfies Schema.Schema<ICollectionTileDef>,
);

export function parseTileDefFromDataTransfer(
  dataTransfer: DataTransfer | null,
): ICollectionTileDef | null {
  if (!dataTransfer) {
    return null;
  }
  const raw = dataTransfer.getData(TILE_DRAG_MIME);
  if (!raw) {
    return null;
  }
  const decoded = Schema.decodeUnknownEither(TileDragDefFromJsonStringSchema)(raw);
  if (Either.isLeft(decoded)) {
    return null;
  }
  return decoded.right;
}
