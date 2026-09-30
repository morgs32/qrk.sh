"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";
import { create, useStore } from "zustand";

import { BREAKPOINTS } from "./breakpoints";
import { brickDragStore } from "./brickDragStore";
import { useElementWidthRef } from "./useElementWidthRef";

function createWallViewportStore(initialState?: {
  selectedBreakpoint?: (typeof BREAKPOINTS)[number]["id"] | null;
}) {
  return create<{
    selectedBreakpoint: (typeof BREAKPOINTS)[number]["id"] | null;
    activeBreakpoint: (typeof BREAKPOINTS)[number]["id"] | null;
    availableWidth: number;
    gridGesture: boolean;
    catalogDragActive: boolean;
    displayPlaceholders: boolean;
    setSelectedBreakpoint: (breakpoint: (typeof BREAKPOINTS)[number]["id"] | null) => void;
    setDisplayPlaceholders: (displayPlaceholders: boolean) => void;
    setAvailableWidth: (width: number) => void;
    setGridGesture: (active: boolean) => void;
    setCatalogDragActive: (active: boolean) => void;
  }>()((set) => ({
    selectedBreakpoint: initialState?.selectedBreakpoint ?? null,
    activeBreakpoint: null,
    availableWidth: 0,
    gridGesture: false,
    catalogDragActive: false,
    displayPlaceholders: false,
    setSelectedBreakpoint: (selectedBreakpoint) =>
      set((state) => ({
        selectedBreakpoint,
        activeBreakpoint:
          state.gridGesture || state.catalogDragActive
            ? state.activeBreakpoint
            : resolveActiveBreakpoint(selectedBreakpoint, state.availableWidth),
      })),
    setDisplayPlaceholders: (displayPlaceholders) => set({ displayPlaceholders }),
    setAvailableWidth: (availableWidth) =>
      set((state) => ({
        availableWidth,
        activeBreakpoint:
          state.gridGesture || state.catalogDragActive
            ? state.activeBreakpoint
            : resolveActiveBreakpoint(state.selectedBreakpoint, availableWidth),
      })),
    setGridGesture: (gridGesture) =>
      set((state) => ({
        gridGesture,
        activeBreakpoint:
          gridGesture || state.catalogDragActive
            ? state.activeBreakpoint
            : resolveActiveBreakpoint(state.selectedBreakpoint, state.availableWidth),
      })),
    setCatalogDragActive: (catalogDragActive) =>
      set((state) => ({
        catalogDragActive,
        activeBreakpoint:
          catalogDragActive || state.gridGesture
            ? state.activeBreakpoint
            : resolveActiveBreakpoint(state.selectedBreakpoint, state.availableWidth),
      })),
  }));
}

function resolveActiveBreakpoint(
  selectedBreakpoint: (typeof BREAKPOINTS)[number]["id"] | null,
  availableWidth: number,
): (typeof BREAKPOINTS)[number]["id"] | null {
  if (availableWidth < BREAKPOINTS[0].previewWidth) {
    return null;
  }

  if (selectedBreakpoint !== null) {
    const selected = BREAKPOINTS.find((row) => row.id === selectedBreakpoint);
    if (selected !== undefined && selected.previewWidth <= availableWidth) {
      return selectedBreakpoint;
    }
  }

  return [...BREAKPOINTS].reverse().find((row) => row.previewWidth <= availableWidth)?.id ?? null;
}

const WallViewportContext = createContext<{
  store: ReturnType<typeof createWallViewportStore>;
  regionRef: RefCallback<HTMLElement>;
} | null>(null);

export function WallViewportProvider(props: {
  children: ReactNode;
  selectedBreakpoint?: (typeof BREAKPOINTS)[number]["id"] | null;
}) {
  const { children, selectedBreakpoint = null } = props;
  const [store] = useState(() => createWallViewportStore({ selectedBreakpoint }));
  const regionRef = useElementWidthRef((width) => {
    store.getState().setAvailableWidth(width);
  });
  useEffect(() => {
    const forward = (state: ReturnType<typeof brickDragStore.getState>) => {
      store.getState().setCatalogDragActive(state.brickDef !== null);
    };
    const unsubscribe = brickDragStore.subscribe(forward);
    forward(brickDragStore.getState());
    return unsubscribe;
  }, [store]);

  return <WallViewportContext value={{ store, regionRef }}>{children}</WallViewportContext>;
}

export function useWallViewportStoreApi() {
  const value = useContext(WallViewportContext);
  if (!value) {
    throw new Error("useWallViewportStoreApi requires WallViewportProvider");
  }
  return value.store;
}

export function useWallViewport() {
  const value = useContext(WallViewportContext);
  if (!value) {
    throw new Error("useWallViewport requires WallViewportProvider");
  }

  const selectedBreakpoint = useStore(value.store, (state) => state.selectedBreakpoint);
  const availableWidth = useStore(value.store, (state) => state.availableWidth);
  const activeBreakpoint = useStore(value.store, (state) => state.activeBreakpoint);
  const gridGesture = useStore(value.store, (state) => state.gridGesture);
  const displayPlaceholders = useStore(value.store, (state) => state.displayPlaceholders);
  const setSelectedBreakpoint = useStore(value.store, (state) => state.setSelectedBreakpoint);
  const setGridGesture = useStore(value.store, (state) => state.setGridGesture);
  const setDisplayPlaceholders = useStore(value.store, (state) => state.setDisplayPlaceholders);

  return {
    selectedBreakpoint,
    setSelectedBreakpoint,
    displayPlaceholders,
    setDisplayPlaceholders,
    availableWidth,
    activeBreakpoint,
    gridGesture,
    setGridGesture,
    regionRef: value.regionRef,
  };
}
