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
import { homepageGridConfig, homepageTiles } from '@/components/home/tiles';
import {
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  layoutPositionsEqual,
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
const tileDefinitions = homepageTiles.map(({ id, size, Component }) => ({
  id,
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
  const tiles = usePortfolioGridStore((state) => state.tiles);
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

  useEffect(() => {
    if (!initialized) {
      initializeGrid(
        tileDefinitions.map(({ id, size }) => ({ id, size })),
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

  const visibleIds = useMemo(() => {
    const hiddenSet = new Set(hiddenByBreakpoint[breakpoint]);
    return tiles.filter((tile) => !hiddenSet.has(tile.id)).map((tile) => tile.id);
  }, [breakpoint, hiddenByBreakpoint, tiles]);

  const renderLayout = useMemo(() => {
    return toRenderableLayout(
      layouts[breakpoint],
      breakpoint,
      alignmentByBreakpoint[breakpoint]
    );
  }, [alignmentByBreakpoint, breakpoint, layouts]);

  const orderedTiles = useMemo(() => {
    const layoutPositions = new Map(renderLayout.map((item) => [item.i, item]));
    const visibleIdSet = new Set(visibleIds);

    return tileDefinitions
      .filter((tile) => visibleIdSet.has(tile.id))
      .sort((first, second) => {
        const firstItem = layoutPositions.get(first.id);
        const secondItem = layoutPositions.get(second.id);

        if (!firstItem || !secondItem) {
          return 0;
        }

        return firstItem.y - secondItem.y || firstItem.x - secondItem.x;
      });
  }, [renderLayout, visibleIds]);

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

  return (
    <div ref={containerRef} className="w-full" data-testid="portfolio-grid-root">
      {!mounted || !initialized || computedRowHeight === 0 ? (
        <div className="grid grid-cols-2">
          {tileDefinitions.map(({ id, Component }) => (
            <div key={id} className="aspect-square">
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
          >
            {orderedTiles.map(({ id, Component }) => (
              <div
                key={id}
                data-tile-id={id}
                className="cursor-grab touch-none active:cursor-grabbing"
              >
                <Component />
              </div>
            ))}
          </GridLayout>
        </div>
      )}
    </div>
  );
}
