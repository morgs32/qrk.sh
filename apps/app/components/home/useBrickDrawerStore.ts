import type { ICatalogBrickDef } from "@qrk.sh/bricks";
import { Result, Schema } from "effect";
import type { Layout } from "react-grid-layout";
import { create } from "zustand";

export const BRICK_DRAG_MIME = "application/x-qrk-brick-def";

type BrickDrawerDragState = {
  pageGrids: Record<string, { layout: Layout; bricksById: Record<string, ICatalogBrickDef> }>;
  activeBrickDragGridShape: { w: number; h: number } | null;
  registerActiveBrickDragGridShape: (w: number, h: number) => void;
  unregisterActiveBrickDragGridShape: () => void;
};

export const useBrickDrawerStore = create<BrickDrawerDragState>((set) => ({
  pageGrids: {},
  activeBrickDragGridShape: null,
  registerActiveBrickDragGridShape: (w, h) => set({ activeBrickDragGridShape: { w, h } }),
  unregisterActiveBrickDragGridShape: () => set({ activeBrickDragGridShape: null }),
}));

/**
 * Browsers often omit custom `getData` payloads during `dragover`; only `dragstart`/`drop` see them.
 * Register the resolved breakpoint dimensions on drag start so the grid drop placeholder can size before drop.
 */
export function getActiveBrickDragGridShape(): { w: number; h: number } | null {
  return useBrickDrawerStore.getState().activeBrickDragGridShape;
}

const BrickDragDefFromJsonStringSchema = Schema.fromJsonString(
  Schema.Struct({
    catalogName: Schema.String,
    catalogLabel: Schema.String,
    label: Schema.String,
    registry: Schema.String,

    order: Schema.Number,
    xs: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
    sm: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
    lg: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
    xl: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
    data: Schema.Unknown,
  }) satisfies Schema.Schema<ICatalogBrickDef>,
);

export function parseBrickDefFromDataTransfer(
  dataTransfer: DataTransfer | null,
): ICatalogBrickDef | null {
  if (!dataTransfer) {
    return null;
  }
  const raw = dataTransfer.getData(BRICK_DRAG_MIME);
  if (!raw) {
    return null;
  }
  const decoded = Schema.decodeUnknownResult(BrickDragDefFromJsonStringSchema)(raw);
  if (Result.isFailure(decoded)) {
    return null;
  }
  return decoded.success;
}
