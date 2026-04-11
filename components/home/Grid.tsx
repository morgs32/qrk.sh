'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GridLayout,
  getBreakpointFromWidth,
  useContainerWidth,
  verticalCompactor,
  type EventCallback,
  type Layout,
  type LayoutItem
} from 'react-grid-layout';
import { BottomToolbar } from '@/components/home/BottomToolbar';
import { portfolioGridSeed } from '@/components/home/gridState';
import { homepageTiles } from './tiles';
import { TextTilePresentation } from '@/components/home/tiles/collections/TextTile/TextTilePresentation';
import {
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  layoutPositionsEqual,
  sizeToDimensions,
  toCanonicalLayout,
  toRenderableLayout,
  usePortfolioGridStore
} from '@/lib/stores/portfolio-grid-store';

/**
 * Set `NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED=true` when running a second dev
 * server (e.g. port 3001) to A/B `dragConfig.bounded` vs grid math issues.
 */
const GRID_DRAG_BOUNDED =
  process.env.NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED !== 'true';

/**
 * Breakpoints and Zustand-backed layouts are enough here; migrating to
 * `ResponsiveGridLayout` would mostly duplicate that wiring.
 */
const tileDefinitions = homepageTiles.map(({ typeId, size, Component }) => ({
  typeId,
  size,
  Component
}));

type DragGridMetrics = {
  width: number;
  rowHeight: number;
  cols: number;
};

type ExternalGridDragEvent = DragEvent & {
  qrkDragOffsetX?: number;
  qrkDragOffsetY?: number;
  qrkDrawerTypeId?: string;
};

export type GridProps = {
  onAddClick: () => void;
};

export function Grid({ onAddClick }: GridProps) {
  // Default hook (not measureBeforeMount): avoids a stuck 0×0 first measure in
  // nested flex layouts; ResizeObserver then sets the real width.
  const { containerRef, mounted, width, measureWidth } = useContainerWidth();

  useEffect(() => {
    if (!mounted || width > 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      measureWidth();
    });

    return () => cancelAnimationFrame(frame);
  }, [mounted, measureWidth, width]);
  const [dragGridMetrics, setDragGridMetrics] = useState<DragGridMetrics | null>(
    null
  );
  const initialized = usePortfolioGridStore((state) => state.initialized);
  const instances = usePortfolioGridStore((state) => state.instances);
  const layouts = usePortfolioGridStore((state) => state.layouts);
  const alignmentByBreakpoint = usePortfolioGridStore(
    (state) => state.alignmentByBreakpoint
  );
  const initializeGrid = usePortfolioGridStore((state) => state.initializeGrid);
  const setActiveBreakpoint = usePortfolioGridStore(
    (state) => state.setActiveBreakpoint
  );
  const externalDraggingTypeId = usePortfolioGridStore(
    (state) => state.externalDraggingTypeId
  );
  const setExternalDropPosition = usePortfolioGridStore(
    (state) => state.setExternalDropPosition
  );
  const setBreakpointLayout = usePortfolioGridStore(
    (state) => state.setBreakpointLayout
  );
  const setGridCellHeightPx = usePortfolioGridStore((state) => state.setGridCellHeightPx);

  useEffect(() => {
    if (!initialized) {
      initializeGrid(portfolioGridSeed);
    }
  }, [initializeGrid, initialized]);

  const breakpoint = mounted
    ? getBreakpointFromWidth(GRID_BREAKPOINTS, width)
    : 'lg';

  useEffect(() => {
    setActiveBreakpoint(breakpoint);
  }, [breakpoint, setActiveBreakpoint]);

  useEffect(() => {
    if (!mounted || width <= 0) {
      setGridCellHeightPx(null);
      return;
    }

    const cols = GRID_COLUMNS[breakpoint];
    setGridCellHeightPx(width / cols);
  }, [breakpoint, mounted, setGridCellHeightPx, width]);

  const renderLayout = useMemo(() => {
    return toRenderableLayout(
      layouts[breakpoint],
      breakpoint,
      alignmentByBreakpoint[breakpoint]
    );
  }, [alignmentByBreakpoint, breakpoint, layouts]);

  const renderLayoutRef = useRef(renderLayout);
  renderLayoutRef.current = renderLayout;

  const layoutChangeDebounceRef = useRef<number | null>(null);
  const pendingLayoutFromGridRef = useRef<Layout | null>(null);

  useEffect(() => {
    return () => {
      if (layoutChangeDebounceRef.current !== null) {
        window.clearTimeout(layoutChangeDebounceRef.current);
      }
    };
  }, []);

  const tileComponentByTypeId = useMemo(() => {
    return new Map(tileDefinitions.map((entry) => [entry.typeId, entry.Component]));
  }, []);

  const tileDimensionsByTypeId = useMemo(() => {
    return new Map(
      tileDefinitions.map((entry) => [entry.typeId, sizeToDimensions(entry.size)])
    );
  }, []);

  const externalDraggingDims = externalDraggingTypeId
    ? tileDimensionsByTypeId.get(externalDraggingTypeId) ?? null
    : null;

  const externalDroppingItem = useMemo<LayoutItem>(
    () => ({
      i: '__external-drop__',
      x: 0,
      y: 0,
      w: externalDraggingDims?.w ?? 1,
      h: externalDraggingDims?.h ?? 1
    }),
    [externalDraggingDims]
  );

  const orderedInstances = useMemo(() => {
    const instanceById = new Map(instances.map((entry) => [entry.instanceId, entry]));
    return renderLayout
      .map((item) => instanceById.get(item.i))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
  }, [instances, renderLayout]);

  const computedRowHeight =
    width > 0 ? width / GRID_COLUMNS[breakpoint] : 0;
  const layoutWidth = dragGridMetrics?.width ?? width;
  const layoutRowHeight = dragGridMetrics?.rowHeight ?? computedRowHeight;
  const layoutCols = dragGridMetrics?.cols ?? GRID_COLUMNS[breakpoint];

  const handleDragStart = useCallback<EventCallback>(() => {
    if (width <= 0) {
      return;
    }

    const cols = GRID_COLUMNS[breakpoint];
    setDragGridMetrics({
      width,
      rowHeight: width / cols,
      cols
    });
  }, [breakpoint, width]);

  const handleDragStop = useCallback<EventCallback>(() => {
    setDragGridMetrics(null);
  }, []);

  const handleLayoutChange = useCallback(
    (nextLayout: Layout) => {
      pendingLayoutFromGridRef.current = nextLayout;

      if (layoutChangeDebounceRef.current !== null) {
        window.clearTimeout(layoutChangeDebounceRef.current);
      }

      layoutChangeDebounceRef.current = window.setTimeout(() => {
        layoutChangeDebounceRef.current = null;

        const layout = pendingLayoutFromGridRef.current;
        pendingLayoutFromGridRef.current = null;
        if (!layout) {
          return;
        }

        const store = usePortfolioGridStore.getState();
        if (store.externalDraggingTypeId) {
          return;
        }

        if (layout.some((item) => item.i === '__external-drop__')) {
          return;
        }

        const bp = breakpoint;
        const canonical = toCanonicalLayout(layout, bp);
        const propCanonical = toCanonicalLayout(renderLayoutRef.current, bp);

        if (layoutPositionsEqual(canonical, propCanonical)) {
          return;
        }

        const currentLayout = store.layouts[bp];
        if (layoutPositionsEqual(canonical, currentLayout)) {
          return;
        }

        setBreakpointLayout(bp, canonical);
      }, 48);
    },
    [breakpoint, setBreakpointLayout]
  );

  const handleExternalDropDragOver = useCallback(
    (event: DragEvent) => {
      if (!externalDraggingDims) {
        return false;
      }

      const bridgeEvent = event as ExternalGridDragEvent;

      return {
        w: externalDraggingDims.w,
        h: externalDraggingDims.h,
        dragOffsetX:
          typeof bridgeEvent.qrkDragOffsetX === 'number'
            ? bridgeEvent.qrkDragOffsetX
            : 0,
        dragOffsetY:
          typeof bridgeEvent.qrkDragOffsetY === 'number'
            ? bridgeEvent.qrkDragOffsetY
            : 0
      };
    },
    [externalDraggingDims]
  );

  const handleExternalDrop = useCallback(
    (_layout: Layout, item: LayoutItem | undefined) => {
      if (!externalDraggingTypeId || !item) {
        return;
      }

      setExternalDropPosition({
        typeId: externalDraggingTypeId,
        position: {
          x: item.x,
          y: item.y
        }
      });
    },
    [externalDraggingTypeId, setExternalDropPosition]
  );

  return (
    <>
      <div ref={containerRef} className="w-full">
        <div className="w-full" data-testid="portfolio-grid-root">
          {!mounted || !initialized || computedRowHeight === 0 ? (
            <div className="grid grid-cols-2">
              {tileDefinitions.map(({ typeId, Component }) => (
                <div key={typeId} className="aspect-square">
                  <Component />
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full" data-testid="portfolio-grid-layout">
              <GridLayout
                width={layoutWidth}
                layout={renderLayout}
                autoSize
                className="portfolio-grid"
                compactor={verticalCompactor}
                gridConfig={{
                  cols: layoutCols,
                  rowHeight: layoutRowHeight,
                  margin: [0, 0],
                  containerPadding: [0, 0],
                  maxRows: Number.POSITIVE_INFINITY
                }}
                dragConfig={{
                  enabled: true,
                  bounded: GRID_DRAG_BOUNDED,
                  threshold: 3
                }}
                dropConfig={{
                  enabled: true,
                  defaultItem: {
                    w: externalDroppingItem.w,
                    h: externalDroppingItem.h
                  },
                  onDragOver: handleExternalDropDragOver
                }}
                droppingItem={externalDroppingItem}
                resizeConfig={{
                  enabled: false,
                  handles: []
                }}
                onDragStart={handleDragStart}
                onDragStop={handleDragStop}
                onDrop={handleExternalDrop}
                onLayoutChange={handleLayoutChange}
              >
                {orderedInstances.map((instance) => {
                  const Component = tileComponentByTypeId.get(instance.typeId);
                  if (!Component && !instance.text) {
                    return null;
                  }

                  return (
                    <div
                      key={instance.instanceId}
                      data-tile-instance-id={instance.instanceId}
                      data-tile-type-id={instance.typeId}
                      className="cursor-grab touch-none active:cursor-grabbing"
                    >
                      {instance.text ? (
                        <TextTilePresentation
                          title={instance.text.title}
                          category={instance.text.category}
                          href={instance.text.href}
                          size={instance.size}
                        />
                      ) : (
                        Component && <Component />
                      )}
                    </div>
                  );
                })}
              </GridLayout>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 right-0 z-30 flex justify-center px-4">
        <div className="pointer-events-auto">
          <BottomToolbar onAddClick={onAddClick} />
        </div>
      </div>
    </>
  );
}
