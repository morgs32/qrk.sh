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
export type TileSize = '1x1' | '2x2' | '4x4' | '2x1' | '4x1' | '4x2';

export type PortfolioGridTileType = {
  typeId: string;
  size: TileSize;
};

export type PortfolioGridTileInstance = {
  instanceId: string;
  typeId: string;
  size: TileSize;
};

export type GridLayouts = Record<GridBreakpoint, Layout>;
export type HiddenByBreakpoint = Record<GridBreakpoint, string[]>;
export type AlignmentByBreakpoint = Record<GridBreakpoint, GridAlignment>;
export type ExternalDropPosition = {
  typeId: string;
  position: { x: number; y: number };
};

export type PortfolioGridConfig = {
  alignmentByBreakpoint?: Partial<AlignmentByBreakpoint>;
  hiddenByBreakpoint?: Partial<HiddenByBreakpoint>;
};

type PortfolioGridState = {
  activeBreakpoint: GridBreakpoint;
  tileTypes: PortfolioGridTileType[];
  instances: PortfolioGridTileInstance[];
  layouts: GridLayouts;
  hiddenByBreakpoint: HiddenByBreakpoint;
  alignmentByBreakpoint: AlignmentByBreakpoint;
  externalDraggingTypeId: string | null;
  externalDropPosition: ExternalDropPosition | null;
  /** Pixel size of one grid row/column (`width / cols`), for drawer preview at drop scale. */
  gridCellHeightPx: number | null;
  initialHiddenByBreakpoint: HiddenByBreakpoint;
  initialAlignmentByBreakpoint: AlignmentByBreakpoint;
  initialized: boolean;
  initializeGrid: (
    tileTypes: PortfolioGridTileType[],
    config?: PortfolioGridConfig
  ) => void;
  setActiveBreakpoint: (breakpoint: GridBreakpoint) => void;
  setExternalDraggingTypeId: (typeId: string | null) => void;
  setExternalDropPosition: (drop: ExternalDropPosition | null) => void;
  setGridCellHeightPx: (px: number | null) => void;
  setBreakpointLayout: (breakpoint: GridBreakpoint, layout: Layout) => void;
  setBreakpointAlignment: (
    breakpoint: GridBreakpoint,
    alignment: GridAlignment
  ) => void;
  hideItem: (breakpoint: GridBreakpoint, id: string) => void;
  showItem: (breakpoint: GridBreakpoint, id: string) => void;
  addInstanceAt: (
    breakpoint: GridBreakpoint,
    typeId: string,
    position: { x: number; y: number }
  ) => string | null;
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

/** Compare grid positions only (i, x, y, w, h); ignores static flags etc. */
export function layoutPositionsEqual(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortById = (layout: Layout) =>
    [...layout].sort((left, right) => left.i.localeCompare(right.i));

  const sortedA = sortById(a);
  const sortedB = sortById(b);

  for (let index = 0; index < sortedA.length; index += 1) {
    const itemA = sortedA[index];
    const itemB = sortedB[index];
    if (
      !itemB ||
      itemA.i !== itemB.i ||
      itemA.x !== itemB.x ||
      itemA.y !== itemB.y ||
      itemA.w !== itemB.w ||
      itemA.h !== itemB.h
    ) {
      return false;
    }
  }

  return true;
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
    case '4x1':
      return { w: 4, h: 1 };
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

function getVisibleInstances(
  instances: PortfolioGridTileInstance[],
  hiddenIds: string[]
): PortfolioGridTileInstance[] {
  const hiddenSet = new Set(hiddenIds);
  return instances.filter((tile) => !hiddenSet.has(tile.instanceId));
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
  instances: PortfolioGridTileInstance[],
  breakpoint: GridBreakpoint
): Layout {
  const cols = GRID_COLUMNS[breakpoint];
  const layout: LayoutItem[] = [];

  instances.forEach((tile) => {
    const { w, h } = sizeToDimensions(tile.size);
    let y = 0;
    let placed = false;

    while (!placed) {
      for (let x = 0; x <= cols - w; x += 1) {
        const candidate: LayoutItem = {
          i: tile.instanceId,
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
  tile: PortfolioGridTileInstance,
  breakpoint: GridBreakpoint
): Layout {
  const { w, h } = sizeToDimensions(tile.size);
  const nextY = layout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);

  return toCanonicalLayout(
    [
      ...cloneLayout(layout),
      {
        i: tile.instanceId,
        x: 0,
        y: nextY,
        w,
        h
      }
    ],
    breakpoint
  );
}

function seedInstances(tileTypes: PortfolioGridTileType[]): PortfolioGridTileInstance[] {
  const seededTileTypes = tileTypes.filter((tileType) => !tileType.typeId.includes('--'));

  return seededTileTypes.map((tileType, index) => ({
    instanceId: `${tileType.typeId}--${index}`,
    typeId: tileType.typeId,
    size: tileType.size
  }));
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
  instances: PortfolioGridTileInstance[],
  layouts: GridLayouts,
  hiddenByBreakpoint: HiddenByBreakpoint
): Layout {
  const visibleInstances = getVisibleInstances(
    instances,
    hiddenByBreakpoint[breakpoint]
  );
  if (visibleInstances.length === 0) {
    return [];
  }

  const visibleInstanceIds = visibleInstances.map((tile) => tile.instanceId);
  const breakpointIndex = GRID_BREAKPOINT_ORDER.indexOf(breakpoint);

  for (let index = breakpointIndex - 1; index >= 0; index -= 1) {
    const sourceBreakpoint = GRID_BREAKPOINT_ORDER[index];
    const sourceLayout = filterLayout(layouts[sourceBreakpoint], visibleInstanceIds);

    if (sourceLayout.length > 0) {
      return visibleInstances.reduce(
        (nextLayout, tile) =>
          nextLayout.some((item) => item.i === tile.instanceId)
            ? nextLayout
            : appendItemToBottom(nextLayout, tile, breakpoint),
        toCanonicalLayout(sourceLayout, breakpoint)
      );
    }
  }

  return buildInitialLayout(visibleInstances, breakpoint);
}

function buildInitialState(
  instances: PortfolioGridTileInstance[],
  config?: PortfolioGridConfig
) {
  const hiddenByBreakpoint = mergeHiddenByBreakpoint(config?.hiddenByBreakpoint);
  const alignmentByBreakpoint = mergeAlignmentByBreakpoint(
    config?.alignmentByBreakpoint
  );
  const lgInstances = getVisibleInstances(instances, hiddenByBreakpoint.lg);
  const lgLayout = buildInitialLayout(lgInstances, 'lg');
  const seedLayouts: GridLayouts = {
    lg: lgLayout,
    md: [],
    sm: []
  };

  return {
    layouts: {
      lg: lgLayout,
      md: deriveBreakpointLayout('md', instances, seedLayouts, hiddenByBreakpoint),
      sm: deriveBreakpointLayout('sm', instances, seedLayouts, hiddenByBreakpoint)
    },
    hiddenByBreakpoint,
    alignmentByBreakpoint
  };
}

export const usePortfolioGridStore = create<PortfolioGridState>((set, get) => ({
  activeBreakpoint: 'lg',
  tileTypes: [],
  instances: [],
  layouts: emptyLayouts(),
  hiddenByBreakpoint: defaultHiddenByBreakpoint(),
  alignmentByBreakpoint: defaultAlignmentByBreakpoint(),
  externalDraggingTypeId: null,
  externalDropPosition: null,
  gridCellHeightPx: null,
  initialHiddenByBreakpoint: defaultHiddenByBreakpoint(),
  initialAlignmentByBreakpoint: defaultAlignmentByBreakpoint(),
  initialized: false,
  initializeGrid: (tileTypes, config) => {
    if (get().initialized) {
      return;
    }

    const instances = seedInstances(tileTypes);
    const initialState = buildInitialState(instances, config);

    set({
      tileTypes,
      instances,
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
  setExternalDraggingTypeId: (typeId) => {
    set({ externalDraggingTypeId: typeId });
  },
  setExternalDropPosition: (drop) => {
    set({ externalDropPosition: drop });
  },
  setGridCellHeightPx: (px) => {
    set({ gridCellHeightPx: px });
  },
  setBreakpointLayout: (breakpoint, layout) => {
    const state = get();
    const visibleInstances = getVisibleInstances(
      state.instances,
      state.hiddenByBreakpoint[breakpoint]
    );
    const visibleInstanceIds = visibleInstances.map((tile) => tile.instanceId);
    let nextLayout = toCanonicalLayout(
      filterLayout(layout, visibleInstanceIds),
      breakpoint
    );

    visibleInstances.forEach((tile) => {
      if (!nextLayout.some((item) => item.i === tile.instanceId)) {
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
    const instance = state.instances.find((entry) => entry.instanceId === id);
    if (!instance) {
      return;
    }

    const nextHidden = state.hiddenByBreakpoint[breakpoint].filter(
      (hiddenId) => hiddenId !== id
    );
    const nextLayout = state.layouts[breakpoint].some((item) => item.i === id)
      ? state.layouts[breakpoint]
      : appendItemToBottom(state.layouts[breakpoint], instance, breakpoint);

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
  addInstanceAt: (breakpoint, typeId, position) => {
    const state = get();
    const tileType = state.tileTypes.find((entry) => entry.typeId === typeId);
    if (!tileType) {
      return null;
    }

    const instanceId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${typeId}--${Date.now()}--${Math.random().toString(16).slice(2)}`;
    const { w, h } = sizeToDimensions(tileType.size);

    const nextInstances: PortfolioGridTileInstance[] = [
      ...state.instances,
      {
        instanceId,
        typeId,
        size: tileType.size
      }
    ];

    const nextHidden = state.hiddenByBreakpoint[breakpoint].filter(
      (hiddenId) => hiddenId !== instanceId
    );

    const candidate: LayoutItem = {
      i: instanceId,
      x: Math.max(0, position.x),
      y: Math.max(0, position.y),
      w,
      h
    };

    const nextLayout = toCanonicalLayout(
      [...cloneLayout(state.layouts[breakpoint]), candidate],
      breakpoint
    );

    set({
      instances: nextInstances,
      hiddenByBreakpoint: {
        ...state.hiddenByBreakpoint,
        [breakpoint]: nextHidden
      },
      layouts: {
        ...state.layouts,
        [breakpoint]: nextLayout
      }
    });

    return instanceId;
  },
  resetBreakpoint: (breakpoint) => {
    const state = get();
    const nextLayouts = { ...state.layouts };

    if (breakpoint === 'lg') {
      nextLayouts.lg = buildInitialLayout(
        getVisibleInstances(state.instances, state.hiddenByBreakpoint.lg),
        'lg'
      );
    } else {
      nextLayouts[breakpoint] = deriveBreakpointLayout(
        breakpoint,
        state.instances,
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
    const initialState = buildInitialState(state.instances, {
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
