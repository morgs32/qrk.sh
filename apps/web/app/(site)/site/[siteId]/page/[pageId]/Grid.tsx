"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import GridLayout, {
  useContainerWidth,
  verticalCompactor,
  type EventCallback,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { createScaledStrategy } from "react-grid-layout/core";
import type { ILayout } from "@/components/home/seedLayout";
import { collectionsHash } from "@qrk.sh/bricks";
import {
  getActiveBrickDragGridShape,
  parseBrickDefFromDataTransfer,
  BRICK_DRAG_MIME,
  useBrickDrawerStore,
} from "@/components/home/useBrickDrawerStore";
import type { ICollectionBrickDef } from "@qrk.sh/bricks";
import { useGridLayoutStore } from "@/components/home/useGridLayoutStore";

/**
 * Set `NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED=true` when running a second dev
 * server (e.g. port 3001) to A/B `dragConfig.bounded` vs grid math issues.
 */
const GRID_DRAG_BOUNDED = process.env.NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED !== "true";

const GRID_COLS = 8;

const swatchCollection = collectionsHash.swatch;
const textBrickCollection = collectionsHash["text-brick"];

/** Placeholder identity while dragging from outside (react-grid-layout external drop). */
const DROPPING_ITEM: LayoutItem = {
  i: "__external__",
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

function defaultDefForGridShape(w: number, h: number): ICollectionBrickDef {
  if (w === 8 && h === 2) {
    return textBrickCollection.variants.default.sizes["8x2"].def;
  }
  if (w === 2 && h === 2) {
    return swatchCollection.variants.default.sizes["2x2"].def;
  }
  return swatchCollection.variants.default.sizes["4x4"].def;
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

function dataTransferHasBrickMime(dt: globalThis.DataTransfer | null): boolean {
  if (!dt) {
    return false;
  }
  const { types } = dt;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === BRICK_DRAG_MIME) {
      return true;
    }
  }
  return false;
}

export function Grid() {
  const router = useRouter();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;
  const { containerRef, width, mounted } = useContainerWidth();
  const layout = useGridLayoutStore((s) => s.layout);
  const setLayout = useGridLayoutStore((s) => s.setLayout);
  const zoomIn = useGridLayoutStore((s) => s.zoomIn);
  const [gridDropSessionKey, setGridDropSessionKey] = useState(0);
  const [gridScale, setGridScale] = useState(1);
  /** True after RGL drag threshold until the post-drag `click` can be ignored. */
  const suppressBrickIdClickRef = useRef(false);
  /** True while the brick drag pointer was last seen inside the grid wrapper (hit-test on `dragover`). */
  const pointerWasOverGridRef = useRef(false);
  /** We already remounted because the pointer left the grid; skip redundant `dragend` bump. */
  const clearedPlaceholderByLeaveRef = useRef(false);

  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / GRID_COLS;
  const maxY = layout.reduce((m, li) => Math.max(m, li.y + li.h), 0);
  const gridHeightPx = maxY * rowHeight;

  /**
   * RGL’s dragleave counter can miss leaving the grid; hit-test on `document` `dragover` and remount as
   * soon as the pointer leaves `containerRef`. `dragend` still unregisters shape and bumps if needed.
   */
  useEffect(() => {
    const onDocumentDragOver = (event: globalThis.DragEvent) => {
      if (!dataTransferHasBrickMime(event.dataTransfer)) {
        return;
      }
      const el = containerRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (inside) {
        pointerWasOverGridRef.current = true;
        clearedPlaceholderByLeaveRef.current = false;
        return;
      }

      if (pointerWasOverGridRef.current) {
        pointerWasOverGridRef.current = false;
        clearedPlaceholderByLeaveRef.current = true;
        flushSync(() => {
          setGridDropSessionKey((k) => k + 1);
        });
      }
    };

    const onDocumentDragEnd = (event: globalThis.DragEvent) => {
      pointerWasOverGridRef.current = false;
      const skipBump = clearedPlaceholderByLeaveRef.current;
      clearedPlaceholderByLeaveRef.current = false;
      if (!dataTransferHasBrickMime(event.dataTransfer)) {
        return;
      }
      useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
      if (skipBump) {
        return;
      }
      setGridDropSessionKey((k) => k + 1);
    };

    document.addEventListener("dragover", onDocumentDragOver, true);
    document.addEventListener("dragend", onDocumentDragEnd, true);
    return () => {
      document.removeEventListener("dragover", onDocumentDragOver, true);
      document.removeEventListener("dragend", onDocumentDragEnd, true);
    };
  }, [containerRef]);

  useEffect(() => {
    if (zoomIn) {
      setGridScale(1);
      return;
    }

    const heightPx = gridHeightPx;
    if (!Number.isFinite(heightPx) || heightPx <= 0) {
      setGridScale(1);
      return;
    }

    const el = containerRef.current;
    const parentRect = el?.parentElement?.getBoundingClientRect();
    const parentHeightPx = parentRect?.height ?? 0;
    let availableHeightPx = parentHeightPx;

    if (!Number.isFinite(availableHeightPx) || availableHeightPx <= 0) {
      const headerHeightPx = document.querySelector("header")?.getBoundingClientRect().height ?? 64;
      availableHeightPx = window.innerHeight - headerHeightPx;
    }

    const nextScale = Math.min(1, availableHeightPx / heightPx);
    setGridScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
  }, [containerRef, gridHeightPx, zoomIn]);

  const onDragStart = useCallback<EventCallback>(() => {
    suppressBrickIdClickRef.current = true;
  }, []);

  /** Sync store on drag end only — `onLayoutChange` can fire during RGL reconciliation and loop with controlled `layout`. */
  const onDragStop = useCallback<EventCallback>(
    (next) => {
      try {
        if (next.some((li) => li.i === DROPPING_ITEM.i)) {
          return;
        }
        const prev = useGridLayoutStore.getState().layout;
        if (layoutPositionsMatchStore(prev, next)) {
          return;
        }
        setLayout(mergeRglLayoutIntoILayout(prev, next));
      } finally {
        window.setTimeout(() => {
          suppressBrickIdClickRef.current = false;
        }, 0);
      }
    },
    [setLayout],
  );

  const onDropDragOver = useCallback((e: globalThis.DragEvent) => {
    const parsed = parseBrickDefFromDataTransfer(e.dataTransfer);
    if (parsed) {
      return { w: parsed.w, h: parsed.h };
    }
    const pending = getActiveBrickDragGridShape();
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
          ? parseBrickDefFromDataTransfer((e as globalThis.DragEvent).dataTransfer)
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
      <div
        ref={containerRef}
        className="grid-layout-wrapper w-full"
        data-testid="grid-layout"
        style={{ height: gridHeightPx > 0 ? gridHeightPx * gridScale : undefined }}
      >
        <div
          style={{
            transform: `scale(${gridScale})`,
            transformOrigin: "top left",
            width: gridWidth,
            height: gridHeightPx > 0 ? gridHeightPx : undefined,
          }}
        >
          {mounted && (
            <GridLayout
              key={gridDropSessionKey}
              width={gridWidth}
              layout={layout}
              autoSize
              className="grid-layout"
              compactor={verticalCompactor}
              positionStrategy={createScaledStrategy(gridScale)}
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
              onDragStart={onDragStart}
              onDragStop={onDragStop}
              onDrop={onDrop}
            >
              {layout.map((item) => {
                const catalogVariant =
                  collectionsHash[item.def.collectionName]?.variants[item.def.variant];
                const catalogBrick = catalogVariant?.sizes[item.def.size];
                const BrickComponent = catalogBrick?.component;
                if (!BrickComponent) {
                  return null;
                }

                return (
                  <div
                    key={item.i}
                    data-brick-id={item.i}
                    data-brick-collection-name={item.def.collectionName}
                    data-brick-variant={item.def.variant}
                    data-brick-size={item.def.size}
                    className="cursor-grab touch-none active:cursor-grabbing"
                    onClick={() => {
                      if (suppressBrickIdClickRef.current) {
                        return;
                      }
                      router.push(`/site/${siteId}/page/${pageId}/brick/${item.i}`);
                    }}
                  >
                    {catalogVariant.defaultData === undefined ? (
                      <BrickComponent />
                    ) : (
                      <BrickComponent data={catalogVariant.defaultData} />
                    )}
                  </div>
                );
              })}
            </GridLayout>
          )}
        </div>
      </div>
    </>
  );
}
