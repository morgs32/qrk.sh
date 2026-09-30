"use client";

import { createContext, useContext, useState, type ReactNode, type RefCallback } from "react";
import { create, useStore } from "zustand";

import { BREAKPOINTS, resolveBreakpoint } from "./breakpoints";
import { useElementWidthRef } from "./useElementWidthRef";

function createWallViewportStore(initialState?: {
  selectedBreakpoint?: (typeof BREAKPOINTS)[number]["id"] | null;
}) {
  return create<{
    selectedBreakpoint: (typeof BREAKPOINTS)[number]["id"] | null;
    availableWidth: number;
    wallWidth: number;
    displayPlaceholders: boolean;
    setSelectedBreakpoint: (breakpoint: (typeof BREAKPOINTS)[number]["id"] | null) => void;
    setDisplayPlaceholders: (displayPlaceholders: boolean) => void;
    setAvailableWidth: (width: number) => void;
    setWallWidth: (width: number) => void;
  }>()((set) => ({
    selectedBreakpoint: initialState?.selectedBreakpoint ?? null,
    availableWidth: 0,
    wallWidth: 0,
    displayPlaceholders: false,
    setSelectedBreakpoint: (breakpoint) => set({ selectedBreakpoint: breakpoint }),
    setDisplayPlaceholders: (displayPlaceholders) => set({ displayPlaceholders }),
    setAvailableWidth: (width) => set({ availableWidth: width }),
    setWallWidth: (width) => set({ wallWidth: width }),
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
  wallRef: RefCallback<HTMLElement>;
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
  const wallRef = useElementWidthRef((width) => {
    store.getState().setWallWidth(width);
  });

  return (
    <WallViewportContext value={{ store, regionRef, wallRef }}>{children}</WallViewportContext>
  );
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
  const wallWidth = useStore(value.store, (state) => state.wallWidth);
  const displayPlaceholders = useStore(value.store, (state) => state.displayPlaceholders);
  const setSelectedBreakpoint = useStore(value.store, (state) => state.setSelectedBreakpoint);
  const setDisplayPlaceholders = useStore(value.store, (state) => state.setDisplayPlaceholders);
  const activeBreakpoint = resolveActiveBreakpoint(selectedBreakpoint, availableWidth);
  const wallBreakpoint = wallWidth > 0 ? resolveBreakpoint(wallWidth) : null;

  return {
    selectedBreakpoint,
    setSelectedBreakpoint,
    displayPlaceholders,
    setDisplayPlaceholders,
    availableWidth,
    wallWidth,
    wallBreakpoint,
    activeBreakpoint,
    regionRef: value.regionRef,
    wallRef: value.wallRef,
  };
}
