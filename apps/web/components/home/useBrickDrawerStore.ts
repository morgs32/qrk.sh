import { Either, Schema } from "effect";
import { create } from "zustand";
import type { ICollectionBrickDef } from "@/components/home/bricks/types";

export const BRICK_DRAG_MIME = "application/x-qrk-brick-def";

type BrickDrawerDragState = {
  activeBrickDragGridShape: { w: number; h: number } | null;
  registerActiveBrickDragGridShape: (w: number, h: number) => void;
  unregisterActiveBrickDragGridShape: () => void;
};

export const useBrickDrawerStore = create<BrickDrawerDragState>((set) => ({
  activeBrickDragGridShape: null,
  registerActiveBrickDragGridShape: (w, h) => set({ activeBrickDragGridShape: { w, h } }),
  unregisterActiveBrickDragGridShape: () => set({ activeBrickDragGridShape: null }),
}));

/**
 * Browsers often omit custom `getData` payloads during `dragover`; only `dragstart`/`drop` see them.
 * Register `def.w` / `def.h` on drag start so the grid drop placeholder can size before drop.
 */
export function getActiveBrickDragGridShape(): { w: number; h: number } | null {
  return useBrickDrawerStore.getState().activeBrickDragGridShape;
}

const BrickDragDefFromJsonStringSchema = Schema.parseJson(
  Schema.Struct({
    collectionName: Schema.String,
    collectionLabel: Schema.String,
    label: Schema.String,
    name: Schema.String,
    order: Schema.Number,
    w: Schema.Number,
    h: Schema.Number,
  }) satisfies Schema.Schema<ICollectionBrickDef>,
);

export function parseBrickDefFromDataTransfer(
  dataTransfer: DataTransfer | null,
): ICollectionBrickDef | null {
  if (!dataTransfer) {
    return null;
  }
  const raw = dataTransfer.getData(BRICK_DRAG_MIME);
  if (!raw) {
    return null;
  }
  const decoded = Schema.decodeUnknownEither(BrickDragDefFromJsonStringSchema)(raw);
  if (Either.isLeft(decoded)) {
    return null;
  }
  return decoded.right;
}
