'use client';

import { useEffect, useMemo } from 'react';
import {
  GridLayout,
  getBreakpointFromWidth,
  useContainerWidth,
  verticalCompactor
} from 'react-grid-layout';
import { homepageGridConfig, homepageTiles } from '@/components/home/tiles';
import {
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  toCanonicalLayout,
  toRenderableLayout,
  usePortfolioGridStore
} from '@/lib/stores/portfolio-grid-store';

const tileDefinitions = homepageTiles.map(({ id, size, Component }) => ({
  id,
  size,
  Component
}));

export function PortfolioGrid() {
  const { containerRef, mounted, width } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 0
  });
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

  const rowHeight =
    width > 0 ? width / GRID_COLUMNS[breakpoint] : 0;

  return (
    <div ref={containerRef} className="w-full">
      {!mounted || !initialized || rowHeight === 0 ? (
        <div className="grid grid-cols-2">
          {tileDefinitions.map(({ id, Component }) => (
            <div key={id} className="aspect-square">
              <Component />
            </div>
          ))}
        </div>
      ) : (
        <GridLayout
          width={width}
          layout={renderLayout}
          autoSize
          className="portfolio-grid"
          compactor={verticalCompactor}
          gridConfig={{
            cols: GRID_COLUMNS[breakpoint],
            rowHeight,
            margin: [0, 0],
            containerPadding: [0, 0],
            maxRows: Infinity
          }}
          dragConfig={{
            enabled: true,
            bounded: true,
            threshold: 3
          }}
          resizeConfig={{
            enabled: false,
            handles: []
          }}
          onLayoutChange={(nextLayout) => {
            setBreakpointLayout(
              breakpoint,
              toCanonicalLayout(nextLayout, breakpoint)
            );
          }}
        >
          {orderedTiles.map(({ id, Component }) => (
            <div
              key={id}
              className="cursor-grab touch-none active:cursor-grabbing"
            >
              <Component />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
