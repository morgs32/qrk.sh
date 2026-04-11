'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GridLayout,
  getBreakpointFromWidth,
  useContainerWidth,
  verticalCompactor,
  type EventCallback,
  type Layout
} from 'react-grid-layout';
import { homepageGridConfig, homepageTiles } from './tiles';
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

export function PortfolioGrid() {
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
  const hiddenByBreakpoint = usePortfolioGridStore(
    (state) => state.hiddenByBreakpoint
  );
  const alignmentByBreakpoint = usePortfolioGridStore(
    (state) => state.alignmentByBreakpoint
  );
  const initializeGrid = usePortfolioGridStore((state) => state.initializeGrid);
  const setActiveBreakpoint = usePortfolioGridStore(
    (state) => state.setActiveBreakpoint
  );
  const setBreakpointLayout = usePortfolioGridStore(
    (state) => state.setBreakpointLayout
  );
  const addInstanceAt = usePortfolioGridStore((state) => state.addInstanceAt);
  const draggingTypeId = usePortfolioGridStore((state) => state.draggingTypeId);
  const setGridCellHeightPx = usePortfolioGridStore((state) => state.setGridCellHeightPx);

  useEffect(() => {
    if (!initialized) {
      initializeGrid(
        tileDefinitions.map(({ typeId, size }) => ({ typeId, size })),
        homepageGridConfig
      );
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

  const visibleIds = useMemo(() => {
    const hiddenSet = new Set(hiddenByBreakpoint[breakpoint]);
    return instances
      .filter((tile) => !hiddenSet.has(tile.instanceId))
      .map((tile) => tile.instanceId);
  }, [breakpoint, hiddenByBreakpoint, instances]);

  const renderLayout = useMemo(() => {
    return toRenderableLayout(
      layouts[breakpoint],
      breakpoint,
      alignmentByBreakpoint[breakpoint]
    );
  }, [alignmentByBreakpoint, breakpoint, layouts]);

  const tileComponentByTypeId = useMemo(() => {
    return new Map(tileDefinitions.map((entry) => [entry.typeId, entry.Component]));
  }, []);

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
      const canonical = toCanonicalLayout(nextLayout, breakpoint);
      if (layoutPositionsEqual(canonical, layouts[breakpoint])) {
        return;
      }

      setBreakpointLayout(breakpoint, canonical);
    },
    [breakpoint, layouts, setBreakpointLayout]
  );

  const dimensionsByTypeId = useMemo(() => {
    return new Map(
      tileDefinitions.map((entry) => [entry.typeId, sizeToDimensions(entry.size)])
    );
  }, []);

  const handleDrop = useCallback(
    (_layout: Layout, item: { x: number; y: number } | undefined, e: Event) => {
      const dragEvent = e as DragEvent;
      const typeId =
        dragEvent.dataTransfer?.getData('application/x-qrk-tile-type') ||
        dragEvent.dataTransfer?.getData('text/plain') ||
        dragEvent.dataTransfer?.getData('text') ||
        draggingTypeId ||
        '';

      if (!typeId || !item) {
        return;
      }

      addInstanceAt(breakpoint, typeId, { x: item.x, y: item.y });
    },
    [addInstanceAt, breakpoint]
  );

  return (
    <div ref={containerRef} className="w-full" data-testid="portfolio-grid-root">
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
              maxRows: Infinity
            }}
            dragConfig={{
              enabled: true,
              bounded: GRID_DRAG_BOUNDED,
              threshold: 3
            }}
            resizeConfig={{
              enabled: false,
              handles: []
            }}
            onDragStart={handleDragStart}
            onDragStop={handleDragStop}
            onLayoutChange={handleLayoutChange}
            onDrop={handleDrop}
            droppingItem={{ i: '__dropping__', x: 0, y: 0, w: 2, h: 2 }}
            dropConfig={{
              enabled: true,
              defaultItem: { w: 2, h: 2 },
              onDragOver: (e) => {
                const typeId =
                  e.dataTransfer?.getData('application/x-qrk-tile-type') ||
                  e.dataTransfer?.getData('text/plain') ||
                  e.dataTransfer?.getData('text') ||
                  '';
                const dims = dimensionsByTypeId.get(typeId);
                if (!dims) {
                  return;
                }

                return { w: dims.w, h: dims.h };
              }
            }}
          >
            {orderedInstances.map((instance) => {
              const Component = tileComponentByTypeId.get(instance.typeId);
              if (!Component) {
                return null;
              }

              return (
                <div
                  key={instance.instanceId}
                  data-tile-instance-id={instance.instanceId}
                  data-tile-type-id={instance.typeId}
                  className="cursor-grab touch-none active:cursor-grabbing"
                >
                  <Component />
                </div>
              );
            })}
          </GridLayout>
        </div>
      )}
    </div>
  );
}

