"use client";

import { createContext, useContext, useState, type ReactNode, type RefCallback } from "react";
import { create, useStore } from "zustand";

import { BREAKPOINTS } from "./breakpoints";
import { useElementWidthRef } from "./useElementWidthRef";

function createWallViewportStore(initialState?: {
  selectedBreakpoint?: (typeof BREAKPOINTS)[number]["id"] | null;
}) {
  return create<{
    selectedBreakpoint: (typeof BREAKPOINTS)[number]["id"] | null;
    activeBreakpoint: (typeof BREAKPOINTS)[number]["id"] | null;
    availableWidth: number;
    displayPlaceholders: boolean;
    setSelectedBreakpoint: (breakpoint: (typeof BREAKPOINTS)[number]["id"] | null) => void;
    setDisplayPlaceholders: (displayPlaceholders: boolean) => void;
    setAvailableWidth: (width: number) => void;
  }>()((set) => ({
    selectedBreakpoint: initialState?.selectedBreakpoint ?? null,
    activeBreakpoint: null,
    availableWidth: 0,
    displayPlaceholders: false,
    setSelectedBreakpoint: (selectedBreakpoint) =>
      set((state) => ({
        selectedBreakpoint,
        activeBreakpoint: resolveActiveBreakpoint(selectedBreakpoint, state.availableWidth),
      })),
    setDisplayPlaceholders: (displayPlaceholders) => set({ displayPlaceholders }),
    setAvailableWidth: (availableWidth) =>
      set((state) => ({
        availableWidth,
        activeBreakpoint: resolveActiveBreakpoint(state.selectedBreakpoint, availableWidth),
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
  const displayPlaceholders = useStore(value.store, (state) => state.displayPlaceholders);
  const setSelectedBreakpoint = useStore(value.store, (state) => state.setSelectedBreakpoint);
  const setDisplayPlaceholders = useStore(value.store, (state) => state.setDisplayPlaceholders);

  return {
    selectedBreakpoint,
    setSelectedBreakpoint,
    displayPlaceholders,
    setDisplayPlaceholders,
    availableWidth,
    activeBreakpoint,
    regionRef: value.regionRef,
  };
}
