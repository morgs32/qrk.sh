"use client";

import { useCallback, useEffect, useState } from "react";
import GridLayout, {
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { BottomToolbar } from "@/components/home/BottomToolbar";
import type { ILayout } from "@/components/home/seedLayout";
import { creamSquareCollection } from "@/components/home/tiles/collections/CreamSquare/CreamSquareCollection";
import { textTileCollection } from "@/components/home/tiles/collections/TextTile/TextTileCollection";
import { findCollectionTile } from "@/components/home/tiles/findCollectionTile";
import {
  getActiveTileDragGridShape,
  parseTileDefFromDataTransfer,
  registerActiveTileDragGridShape,
  TILE_DRAG_MIME,
  unregisterActiveTileDragGridShape,
} from "@/components/home/tileDragMime";
import { catalogKey, type ICollectionTileDef } from "@/components/home/tiles/types";
import { useGridLayoutStore } from "@/components/home/useGridLayoutStore";

/**
 * Set `NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED=true` when running a second dev
 * server (e.g. port 3001) to A/B `dragConfig.bounded` vs grid math issues.
 */
const GRID_DRAG_BOUNDED = process.env.NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED !== "true";

const GRID_COLS = 4;

const DEMO_EXTERNAL_DRAG_DEF = creamSquareCollection.tiles["1x1"].def;
const DemoExternalDragTile = creamSquareCollection.tiles["1x1"].component;

/** Placeholder identity while dragging from outside (react-grid-layout external drop). */
const DROPPING_ITEM: LayoutItem = {
  i: "__external__",
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

function defaultDefForGridShape(w: number, h: number): ICollectionTileDef {
  if (w === 4 && h === 1) {
    return textTileCollection.tiles["4x1"].def;
  }
  if (w === 1 && h === 1) {
    return creamSquareCollection.tiles["1x1"].def;
  }
  return creamSquareCollection.tiles["2x2"].def;
}

function mergeRglLayoutIntoILayout(prev: ILayout, rgl: Layout): ILayout {
  const prevByI = new Map(prev.map((p) => [p.i, p]));
  return rgl.map((li) => {
    const old = prevByI.get(li.i);
    if (old) {
      return { ...li, def: old.def };
    }
    return { ...li, def: defaultDefForGridShape(li.w, li.h) };
  });
}

/** Skip `setLayout` when grid geometry matches the store (avoids redundant commits). */
function layoutPositionsMatchStore(prev: ILayout, next: Layout): boolean {
  if (prev.length !== next.length) {
    return false;
  }
  const nextByI = new Map(next.map((li) => [li.i, li]));
  for (const p of prev) {
    const n = nextByI.get(p.i);
    if (!n || n.x !== p.x || n.y !== p.y || n.w !== p.w || n.h !== p.h) {
      return false;
    }
  }
  return true;
}

function dataTransferHasTileMime(dt: globalThis.DataTransfer | null): boolean {
  if (!dt) {
    return false;
  }
  const { types } = dt;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === TILE_DRAG_MIME) {
      return true;
    }
  }
  return false;
}

export function Grid({ onAddClick }: { onAddClick: () => void }) {
  const { containerRef, width, mounted } = useContainerWidth();
  const layout = useGridLayoutStore((s) => s.layout);
  const setLayout = useGridLayoutStore((s) => s.setLayout);
  const [gridDropSessionKey, setGridDropSessionKey] = useState(0);

  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / GRID_COLS;

  /** RGL does not clear external-drop placeholder on `dragend`; remount when our tile HTML5 drag ends. */
  useEffect(() => {
    const onDocumentDragEnd = (event: globalThis.DragEvent) => {
      if (!dataTransferHasTileMime(event.dataTransfer)) {
        return;
      }
      unregisterActiveTileDragGridShape();
      setGridDropSessionKey((k) => k + 1);
    };
    document.addEventListener("dragend", onDocumentDragEnd, true);
    return () => {
      document.removeEventListener("dragend", onDocumentDragEnd, true);
    };
  }, []);

  /** Sync store on drag end only — `onLayoutChange` can fire during RGL reconciliation and loop with controlled `layout`. */
  const onDragStop = useCallback(
    (next: Layout) => {
      if (next.some((li) => li.i === DROPPING_ITEM.i)) {
        return;
      }
      const prev = useGridLayoutStore.getState().layout;
      if (layoutPositionsMatchStore(prev, next)) {
        return;
      }
      setLayout(mergeRglLayoutIntoILayout(prev, next));
    },
    [setLayout],
  );

  const onDropDragOver = useCallback((e: globalThis.DragEvent) => {
    const parsed = parseTileDefFromDataTransfer(e.dataTransfer);
    if (parsed) {
      return { w: parsed.w, h: parsed.h };
    }
    const pending = getActiveTileDragGridShape();
    if (pending) {
      return { w: pending.w, h: pending.h };
    }
    return { w: 1, h: 1 };
  }, []);

  const onDrop = useCallback(
    (nextLayout: Layout, item: LayoutItem | undefined, e: Event) => {
      if (!item) {
        return;
      }
      const newId = crypto.randomUUID();
      const prev = useGridLayoutStore.getState().layout;
      const parsed =
        e && "dataTransfer" in e
          ? parseTileDefFromDataTransfer((e as globalThis.DragEvent).dataTransfer)
          : null;

      const mapped = nextLayout.map((li) => {
        const existing = prev.find((p) => p.i === li.i);
        if (existing) {
          return { ...li, def: existing.def };
        }
        return {
          ...li,
          i: newId,
          def: parsed ?? defaultDefForGridShape(li.w, li.h),
        };
      });
      setLayout(mapped);
    },
    [setLayout],
  );

  return (
    <>
      <div className="mb-3">
        <div
          className="droppable-element cursor-grab overflow-hidden rounded-md bg-background/80 active:cursor-grabbing"
          style={{ width: rowHeight, height: rowHeight }}
          draggable
          aria-label="Drag tile into grid"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("text/plain", "new-item");
            e.dataTransfer.setData(TILE_DRAG_MIME, JSON.stringify(DEMO_EXTERNAL_DRAG_DEF));
            registerActiveTileDragGridShape(DEMO_EXTERNAL_DRAG_DEF.w, DEMO_EXTERNAL_DRAG_DEF.h);
          }}
        >
          <div className="h-full w-full">
            <DemoExternalDragTile />
          </div>
        </div>
      </div>

      <div ref={containerRef} className="grid-layout-wrapper w-full" data-testid="grid-layout">
        {mounted && (
          <GridLayout
            key={gridDropSessionKey}
            width={gridWidth}
            layout={layout}
            autoSize
            className="grid-layout"
            compactor={verticalCompactor}
            gridConfig={{
              cols: GRID_COLS,
              rowHeight,
              margin: [0, 0],
              containerPadding: [0, 0],
              maxRows: Number.POSITIVE_INFINITY,
            }}
            dragConfig={{
              enabled: true,
              bounded: GRID_DRAG_BOUNDED,
              threshold: 3,
            }}
            resizeConfig={{
              enabled: false,
              handles: [],
            }}
            dropConfig={{
              enabled: true,
              defaultItem: { w: 1, h: 1 },
              onDragOver: onDropDragOver,
            }}
            droppingItem={DROPPING_ITEM}
            onDragStop={onDragStop}
            onDrop={onDrop}
          >
            {layout.map((item) => {
              const catalogTile = findCollectionTile(item.def);
              const TileComponent = catalogTile?.component;
              if (!TileComponent) {
                return null;
              }

              return (
                <div
                  key={item.i}
                  data-tile-instance-id={item.i}
                  data-tile-type-id={catalogKey(item.def)}
                  className="cursor-grab touch-none active:cursor-grabbing"
                >
                  <TileComponent />
                </div>
              );
            })}
          </GridLayout>
        )}
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 right-0 z-30 flex justify-center px-4">
        <div className="pointer-events-auto">
          <BottomToolbar onAddClick={onAddClick} />
        </div>
      </div>
    </>
  );
}
