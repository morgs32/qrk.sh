"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Spec } from "@json-render/core";
import { verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import { create, useStore } from "zustand";

import type { IModuleBrickDef } from "./types";

function createBricksStore(initialState?: {
  bricksById?: Record<
    string,
    {
      moduleId: string;
      state: unknown;
    } & Record<"sm" | "md" | "lg" | "xl", { gridItem: LayoutItem; spec: Spec; isVisible: boolean }>
  >;
}) {
  return create<{
    bricksById: Record<
      string,
      {
        moduleId: string;
        state: unknown;
      } & Record<"sm" | "md" | "lg" | "xl", { gridItem: LayoutItem; spec: Spec; isVisible: boolean }>
    >;
    activeBrickDrag: (IModuleBrickDef & { spec: Spec; w: number; h: number }) | null;
    hasHydrated: boolean;
    setLayout: (layout: Layout, breakpoint: "sm" | "md" | "lg" | "xl") => void;
    addBrick: (
      brickId: string,
      brickDef: IModuleBrickDef & { spec: Spec; w: number; h: number },
      layout: Layout,
      breakpoint: "sm" | "md" | "lg" | "xl",
    ) => void;
    setActiveBrickDrag: (
      brickDef: (IModuleBrickDef & { spec: Spec; w: number; h: number }) | null,
    ) => void;
    setSpec: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", spec: Spec) => void;
    setVisible: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", visible: boolean) => void;
    setHasHydrated: (hasHydrated: boolean) => void;
  }>()((set, get) => ({
    bricksById: initialState?.bricksById ?? {},
    activeBrickDrag: null,
    hasHydrated: true,
    setLayout: (layout, breakpoint) => {
      set(state => {
        const nextBricksById = { ...state.bricksById };
        for (const gridItem of layout) {
          const brick = nextBricksById[gridItem.i];
          if (!brick) continue;
          const entry = brick[breakpoint];
          if (!entry.isVisible) continue;
          const previous = entry.gridItem;
          if (
            previous.x === gridItem.x &&
            previous.y === gridItem.y &&
            previous.w === gridItem.w &&
            previous.h === gridItem.h
          )
            continue;
          nextBricksById[gridItem.i] = {
            ...brick,
            [breakpoint]: {
              ...structuredClone(entry),
              gridItem: { ...gridItem },
            },
          };
        }
        return { bricksById: nextBricksById };
      });
    },
    addBrick: (brickId, brickDef, layout, breakpoint) => {
      const gridItem = layout.find(item => item.i === brickId);
      if (!gridItem) return;
      const spec = structuredClone(brickDef.spec);
      const sharedGridItem = { ...gridItem };
      set(state => ({
        bricksById: {
          ...state.bricksById,
          [brickId]: {
            moduleId: brickDef.moduleId,
            state: structuredClone(brickDef.state),
            sm: {
              gridItem: { ...sharedGridItem },
              spec: structuredClone(spec),
              isVisible: true,
            },
            md: {
              gridItem: { ...sharedGridItem },
              spec: structuredClone(spec),
              isVisible: true,
            },
            lg: {
              gridItem: { ...sharedGridItem },
              spec: structuredClone(spec),
              isVisible: true,
            },
            xl: {
              gridItem: { ...sharedGridItem },
              spec: structuredClone(spec),
              isVisible: true,
            },
          },
        },
      }));
      get().setLayout(layout, breakpoint);
    },
    setSpec: (brickId, breakpoint, spec) => {
      set(state => {
        const brick = state.bricksById[brickId];
        if (!brick) return state;
        const entry = structuredClone(brick[breakpoint]);
        return {
          bricksById: {
            ...state.bricksById,
            [brickId]: {
              ...brick,
              [breakpoint]: {
                ...entry,
                spec: structuredClone(spec),
              },
            },
          },
        };
      });
    },
    setVisible: (brickId, breakpoint, visible) => {
      set(state => {
        const brick = state.bricksById[brickId];
        if (!brick) return state;
        const entry = structuredClone(brick[breakpoint]);
        if (visible === entry.isVisible) return state;
        entry.isVisible = visible;
        const nextBricksById = {
          ...state.bricksById,
          [brickId]: { ...brick, [breakpoint]: entry },
        };
        const layout = Object.values(nextBricksById).flatMap(placed => {
          const placedEntry = placed[breakpoint];
          return placedEntry.isVisible ? [{ ...placedEntry.gridItem }] : [];
        });
        for (const item of verticalCompactor.compact(layout, 8)) {
          const placed = nextBricksById[item.i];
          const resolved = placed[breakpoint];
          if (resolved.gridItem.x === item.x && resolved.gridItem.y === item.y) continue;
          nextBricksById[item.i] = {
            ...placed,
            [breakpoint]: {
              ...structuredClone(resolved),
              gridItem: { ...item },
            },
          };
        }
        return { bricksById: nextBricksById };
      });
    },

    setActiveBrickDrag: brickDef => {
      set({ activeBrickDrag: brickDef });
    },
    setHasHydrated: hasHydrated => {
      set({ hasHydrated });
    },
  }));
}

const BricksStoreContext = createContext<ReturnType<typeof createBricksStore> | null>(null);

export function BrickStoreProvider(props: {
  children: ReactNode;
  initialState?: Parameters<typeof createBricksStore>[0];
  onChange?: (state: {
    bricksById: ReturnType<ReturnType<typeof createBricksStore>["getState"]>["bricksById"];
  }) => void;
}) {
  const [bricksStore] = useState(() => createBricksStore(props.initialState));

  useEffect(() => {
    if (props.onChange === undefined) return;
    const onChange = props.onChange;
    return bricksStore.subscribe(state => {
      onChange({
        bricksById: state.bricksById,
      });
    });
  }, [bricksStore, props.onChange]);

  return <BricksStoreContext value={bricksStore}>{props.children}</BricksStoreContext>;
}

export function useBricksStoreApi() {
  const store = useContext(BricksStoreContext);
  if (!store) {
    throw new Error("useBricksStoreApi requires BrickStoreProvider");
  }
  return store;
}

export function useBricksStore<T>(
  selector: (state: ReturnType<ReturnType<typeof createBricksStore>["getState"]>) => T,
): T {
  return useStore(useBricksStoreApi(), selector);
}
