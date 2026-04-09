import { create } from 'zustand';
import {
  verticalCompactor,
  type Layout,
  type LayoutItem
} from 'react-grid-layout';

export const GRID_BREAKPOINT_ORDER = ['lg', 'md', 'sm'] as const;
export type GridBreakpoint = (typeof GRID_BREAKPOINT_ORDER)[number];

export const GRID_BREAKPOINTS: Record<GridBreakpoint, number> = {
  lg: 1024,
  md: 768,
  sm: 0
};

export const GRID_COLUMNS: Record<GridBreakpoint, number> = {
  lg: 4,
  md: 4,
  sm: 4
};

export type GridAlignment = 'left' | 'right';
export type TileSize = '1x1' | '2x2' | '4x4' | '2x1' | '4x2';

export type PortfolioGridTile = {
  id: string;
  size: TileSize;
};

export type GridLayouts = Record<GridBreakpoint, Layout>;
export type HiddenByBreakpoint = Record<GridBreakpoint, string[]>;
export type AlignmentByBreakpoint = Record<GridBreakpoint, GridAlignment>;

export type PortfolioGridConfig = {
  alignmentByBreakpoint?: Partial<AlignmentByBreakpoint>;
  hiddenByBreakpoint?: Partial<HiddenByBreakpoint>;
};

type PortfolioGridState = {
  activeBreakpoint: GridBreakpoint;
  tiles: PortfolioGridTile[];
  layouts: GridLayouts;
  hiddenByBreakpoint: HiddenByBreakpoint;
  alignmentByBreakpoint: AlignmentByBreakpoint;
  initialHiddenByBreakpoint: HiddenByBreakpoint;
  initialAlignmentByBreakpoint: AlignmentByBreakpoint;
  initialized: boolean;
  initializeGrid: (
    tiles: PortfolioGridTile[],
    config?: PortfolioGridConfig
  ) => void;
  setActiveBreakpoint: (breakpoint: GridBreakpoint) => void;
  setBreakpointLayout: (breakpoint: GridBreakpoint, layout: Layout) => void;
  setBreakpointAlignment: (
    breakpoint: GridBreakpoint,
    alignment: GridAlignment
  ) => void;
  hideItem: (breakpoint: GridBreakpoint, id: string) => void;
  showItem: (breakpoint: GridBreakpoint, id: string) => void;
  resetBreakpoint: (breakpoint: GridBreakpoint) => void;
  resetAll: () => void;
};

const emptyLayouts = (): GridLayouts => ({
  lg: [],
  md: [],
  sm: []
});

const defaultHiddenByBreakpoint = (): HiddenByBreakpoint => ({
  lg: [],
  md: [],
  sm: []
});

const defaultAlignmentByBreakpoint = (): AlignmentByBreakpoint => ({
  lg: 'left',
  md: 'left',
  sm: 'left'
});

function cloneLayout(layout: Layout): Layout {
  return layout.map((item) => ({ ...item }));
}

function collides(first: LayoutItem, second: LayoutItem) {
  if (first.i === second.i) {
    return false;
  }

  return !(
    first.x + first.w <= second.x ||
    second.x + second.w <= first.x ||
    first.y + first.h <= second.y ||
    second.y + second.h <= first.y
  );
}

export function sizeToDimensions(size: TileSize) {
  switch (size) {
    case '1x1':
      return { w: 1, h: 1 };
    case '2x1':
      return { w: 2, h: 1 };
    case '2x2':
      return { w: 2, h: 2 };
    case '4x2':
      return { w: 4, h: 2 };
    case '4x4':
      return { w: 4, h: 4 };
  }
}

function compactLayout(layout: Layout, breakpoint: GridBreakpoint): Layout {
  if (layout.length === 0) {
    return [];
  }

  return verticalCompactor.compact(
    layout.map((item) => ({ ...item })),
    GRID_COLUMNS[breakpoint]
  );
}

function getVisibleTiles(
  tiles: PortfolioGridTile[],
  hiddenIds: string[]
): PortfolioGridTile[] {
  const hiddenSet = new Set(hiddenIds);
  return tiles.filter((tile) => !hiddenSet.has(tile.id));
}

function filterLayout(layout: Layout, tileIds: string[]): Layout {
  const tileIdSet = new Set(tileIds);
  return layout
    .filter((item) => tileIdSet.has(item.i))
    .map((item) => ({ ...item }));
}

function packRowsLeft(layout: Layout): Layout {
  if (layout.length === 0) {
    return [];
  }

  const minXByRow = new Map<number, number>();

  layout.forEach((item) => {
    const existing = minXByRow.get(item.y);
    minXByRow.set(item.y, existing === undefined ? item.x : Math.min(existing, item.x));
  });

  return layout.map((item) => ({
    ...item,
    x: item.x - (minXByRow.get(item.y) ?? 0)
  }));
}

function packRowsRight(layout: Layout, breakpoint: GridBreakpoint): Layout {
  if (layout.length === 0) {
    return [];
  }

  const leftPackedLayout = packRowsLeft(layout);
  const rowBounds = new Map<number, number>();

  leftPackedLayout.forEach((item) => {
    const rightEdge = item.x + item.w;
    rowBounds.set(item.y, Math.max(rowBounds.get(item.y) ?? 0, rightEdge));
  });

  return leftPackedLayout.map((item) => ({
    ...item,
    x: item.x + (GRID_COLUMNS[breakpoint] - (rowBounds.get(item.y) ?? 0))
  }));
}

export function toCanonicalLayout(
  layout: Layout,
  breakpoint: GridBreakpoint
): Layout {
  return compactLayout(packRowsLeft(layout), breakpoint);
}

export function toRenderableLayout(
  layout: Layout,
  breakpoint: GridBreakpoint,
  alignment: GridAlignment
): Layout {
  const canonicalLayout = toCanonicalLayout(layout, breakpoint);
  if (alignment === 'left') {
    return canonicalLayout;
  }

  return packRowsRight(canonicalLayout, breakpoint);
}

function canPlaceItem(
  layout: LayoutItem[],
  candidate: LayoutItem,
  cols: number
): boolean {
  if (candidate.x + candidate.w > cols) {
    return false;
  }

  return layout.every((item) => !collides(item, candidate));
}

export function buildInitialLayout(
  tiles: PortfolioGridTile[],
  breakpoint: GridBreakpoint
): Layout {
  const cols = GRID_COLUMNS[breakpoint];
  const layout: LayoutItem[] = [];

  tiles.forEach((tile) => {
    const { w, h } = sizeToDimensions(tile.size);
    let y = 0;
    let placed = false;

    while (!placed) {
      for (let x = 0; x <= cols - w; x += 1) {
        const candidate: LayoutItem = {
          i: tile.id,
          x,
          y,
          w,
          h
        };

        if (canPlaceItem(layout, candidate, cols)) {
          layout.push(candidate);
          placed = true;
          break;
        }
      }

      y += 1;
    }
  });

  return toCanonicalLayout(layout, breakpoint);
}

function appendItemToBottom(
  layout: Layout,
  tile: PortfolioGridTile,
  breakpoint: GridBreakpoint
): Layout {
  const { w, h } = sizeToDimensions(tile.size);
  const nextY = layout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);

  return toCanonicalLayout(
    [
      ...cloneLayout(layout),
      {
        i: tile.id,
        x: 0,
        y: nextY,
        w,
        h
      }
    ],
    breakpoint
  );
}

function mergeHiddenByBreakpoint(
  hiddenByBreakpoint?: Partial<HiddenByBreakpoint>
): HiddenByBreakpoint {
  const defaults = defaultHiddenByBreakpoint();

  return {
    lg: [...(hiddenByBreakpoint?.lg ?? defaults.lg)],
    md: [...(hiddenByBreakpoint?.md ?? defaults.md)],
    sm: [...(hiddenByBreakpoint?.sm ?? defaults.sm)]
  };
}

function mergeAlignmentByBreakpoint(
  alignmentByBreakpoint?: Partial<AlignmentByBreakpoint>
): AlignmentByBreakpoint {
  return {
    ...defaultAlignmentByBreakpoint(),
    ...alignmentByBreakpoint
  };
}

function deriveBreakpointLayout(
  breakpoint: GridBreakpoint,
  tiles: PortfolioGridTile[],
  layouts: GridLayouts,
  hiddenByBreakpoint: HiddenByBreakpoint
): Layout {
  const visibleTiles = getVisibleTiles(tiles, hiddenByBreakpoint[breakpoint]);
  if (visibleTiles.length === 0) {
    return [];
  }

  const visibleTileIds = visibleTiles.map((tile) => tile.id);
  const breakpointIndex = GRID_BREAKPOINT_ORDER.indexOf(breakpoint);

  for (let index = breakpointIndex - 1; index >= 0; index -= 1) {
    const sourceBreakpoint = GRID_BREAKPOINT_ORDER[index];
    const sourceLayout = filterLayout(layouts[sourceBreakpoint], visibleTileIds);

    if (sourceLayout.length > 0) {
      return visibleTiles.reduce(
        (nextLayout, tile) =>
          nextLayout.some((item) => item.i === tile.id)
            ? nextLayout
            : appendItemToBottom(nextLayout, tile, breakpoint),
        toCanonicalLayout(sourceLayout, breakpoint)
      );
    }
  }

  return buildInitialLayout(visibleTiles, breakpoint);
}

function buildInitialState(
  tiles: PortfolioGridTile[],
  config?: PortfolioGridConfig
) {
  const hiddenByBreakpoint = mergeHiddenByBreakpoint(config?.hiddenByBreakpoint);
  const alignmentByBreakpoint = mergeAlignmentByBreakpoint(
    config?.alignmentByBreakpoint
  );
  const lgTiles = getVisibleTiles(tiles, hiddenByBreakpoint.lg);
  const lgLayout = buildInitialLayout(lgTiles, 'lg');
  const seedLayouts: GridLayouts = {
    lg: lgLayout,
    md: [],
    sm: []
  };

  return {
    layouts: {
      lg: lgLayout,
      md: deriveBreakpointLayout('md', tiles, seedLayouts, hiddenByBreakpoint),
      sm: deriveBreakpointLayout('sm', tiles, seedLayouts, hiddenByBreakpoint)
    },
    hiddenByBreakpoint,
    alignmentByBreakpoint
  };
}

export const usePortfolioGridStore = create<PortfolioGridState>((set, get) => ({
  activeBreakpoint: 'lg',
  tiles: [],
  layouts: emptyLayouts(),
  hiddenByBreakpoint: defaultHiddenByBreakpoint(),
  alignmentByBreakpoint: defaultAlignmentByBreakpoint(),
  initialHiddenByBreakpoint: defaultHiddenByBreakpoint(),
  initialAlignmentByBreakpoint: defaultAlignmentByBreakpoint(),
  initialized: false,
  initializeGrid: (tiles, config) => {
    if (get().initialized) {
      return;
    }

    const initialState = buildInitialState(tiles, config);

    set({
      tiles,
      layouts: initialState.layouts,
      hiddenByBreakpoint: initialState.hiddenByBreakpoint,
      alignmentByBreakpoint: initialState.alignmentByBreakpoint,
      initialHiddenByBreakpoint: initialState.hiddenByBreakpoint,
      initialAlignmentByBreakpoint: initialState.alignmentByBreakpoint,
      initialized: true
    });
  },
  setActiveBreakpoint: (breakpoint) => {
    set({ activeBreakpoint: breakpoint });
  },
  setBreakpointLayout: (breakpoint, layout) => {
    const state = get();
    const visibleTiles = getVisibleTiles(
      state.tiles,
      state.hiddenByBreakpoint[breakpoint]
    );
    const visibleTileIds = visibleTiles.map((tile) => tile.id);
    let nextLayout = toCanonicalLayout(filterLayout(layout, visibleTileIds), breakpoint);

    visibleTiles.forEach((tile) => {
      if (!nextLayout.some((item) => item.i === tile.id)) {
        nextLayout = appendItemToBottom(nextLayout, tile, breakpoint);
      }
    });

    set({
      layouts: {
        ...state.layouts,
        [breakpoint]: nextLayout
      }
    });
  },
  setBreakpointAlignment: (breakpoint, alignment) => {
    set((state) => ({
      alignmentByBreakpoint: {
        ...state.alignmentByBreakpoint,
        [breakpoint]: alignment
      }
    }));
  },
  hideItem: (breakpoint, id) => {
    const state = get();
    const nextHidden = Array.from(
      new Set([...state.hiddenByBreakpoint[breakpoint], id])
    );

    set({
      hiddenByBreakpoint: {
        ...state.hiddenByBreakpoint,
        [breakpoint]: nextHidden
      },
      layouts: {
        ...state.layouts,
        [breakpoint]: toCanonicalLayout(
          state.layouts[breakpoint].filter((item) => item.i !== id),
          breakpoint
        )
      }
    });
  },
  showItem: (breakpoint, id) => {
    const state = get();
    const tile = state.tiles.find((entry) => entry.id === id);
    if (!tile) {
      return;
    }

    const nextHidden = state.hiddenByBreakpoint[breakpoint].filter(
      (hiddenId) => hiddenId !== id
    );
    const nextLayout = state.layouts[breakpoint].some((item) => item.i === id)
      ? state.layouts[breakpoint]
      : appendItemToBottom(state.layouts[breakpoint], tile, breakpoint);

    set({
      hiddenByBreakpoint: {
        ...state.hiddenByBreakpoint,
        [breakpoint]: nextHidden
      },
      layouts: {
        ...state.layouts,
        [breakpoint]: nextLayout
      }
    });
  },
  resetBreakpoint: (breakpoint) => {
    const state = get();
    const nextLayouts = { ...state.layouts };

    if (breakpoint === 'lg') {
      nextLayouts.lg = buildInitialLayout(
        getVisibleTiles(state.tiles, state.hiddenByBreakpoint.lg),
        'lg'
      );
    } else {
      nextLayouts[breakpoint] = deriveBreakpointLayout(
        breakpoint,
        state.tiles,
        nextLayouts,
        state.hiddenByBreakpoint
      );
    }

    set({
      layouts: nextLayouts
    });
  },
  resetAll: () => {
    const state = get();
    const initialState = buildInitialState(state.tiles, {
      hiddenByBreakpoint: state.initialHiddenByBreakpoint,
      alignmentByBreakpoint: state.initialAlignmentByBreakpoint
    });

    set({
      layouts: initialState.layouts,
      hiddenByBreakpoint: initialState.hiddenByBreakpoint,
      alignmentByBreakpoint: initialState.alignmentByBreakpoint,
      activeBreakpoint: 'lg'
    });
  }
}));
