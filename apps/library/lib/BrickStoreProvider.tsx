"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Spec } from "@json-render/core";
import { verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import { create, useStore } from "zustand";

import { modulesHash } from "./modulesHash";
import type { IModuleBrickDef } from "./types";

function createBricksStore(initialState?: {
  bricksById?: Record<
    string,
    {
      moduleId: string;
      state: unknown;
    } & Record<"sm" | "md" | "lg" | "xl", { gridItem: LayoutItem | null; spec: Spec }>
  >;
}) {
  return create<{
    bricksById: Record<
      string,
      {
        moduleId: string;
        state: unknown;
      } & Record<"sm" | "md" | "lg" | "xl", { gridItem: LayoutItem | null; spec: Spec }>
    >;
    activeBrickDrag: (IModuleBrickDef & { spec: Spec }) | null;
    hasHydrated: boolean;
    setLayout: (layout: Layout, breakpoint: "sm" | "md" | "lg" | "xl") => void;
    addBrick: (
      brickId: string,
      brickDef: IModuleBrickDef & { spec: Spec },
      layout: Layout,
      breakpoint: "sm" | "md" | "lg" | "xl",
    ) => void;
    setActiveBrickDrag: (brickDef: (IModuleBrickDef & { spec: Spec }) | null) => void;
    setSpec: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", spec: Spec) => void;
    setVisible: (
      brickId: string,
      breakpoint: "sm" | "md" | "lg" | "xl",
      visible: boolean,
      gridSize?: { w: number; h: number },
    ) => void;
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
          if (entry.gridItem === null) continue;
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
      const brickModule = modulesHash[brickDef.moduleId];
      const spec = structuredClone(brickDef.spec);
      set(state => {
        let smGridItem: LayoutItem;
        if (breakpoint === "sm") {
          smGridItem = { ...gridItem };
        } else {
          const smDeclared = brickModule?.def.sm;
          const smW = smDeclared?.w ?? gridItem.w;
          const smH = smDeclared?.h ?? gridItem.h;
          let y = 0;
          for (const other of Object.values(state.bricksById)) {
            const item = other.sm.gridItem;
            if (item) y = Math.max(y, item.y + item.h);
          }
          smGridItem = {
            i: brickId,
            x: 0,
            y,
            w: smW,
            h: smH,
          };
        }
        const mdGridItem = { ...gridItem };
        const lgGridItem = { ...gridItem };
        const xlGridItem = { ...gridItem };
        return {
          bricksById: {
            ...state.bricksById,
            [brickId]: {
              moduleId: brickDef.moduleId,
              state: structuredClone(brickDef.state),
              sm: { gridItem: smGridItem, spec: structuredClone(spec) },
              md: { gridItem: mdGridItem, spec: structuredClone(spec) },
              lg: { gridItem: lgGridItem, spec: structuredClone(spec) },
              xl: { gridItem: xlGridItem, spec: structuredClone(spec) },
            },
          },
        };
      });
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
    setVisible: (brickId, breakpoint, visible, gridSize) => {
      set(state => {
        const brick = state.bricksById[brickId];
        if (!brick) return state;
        const entry = structuredClone(brick[breakpoint]);
        if (visible === (entry.gridItem !== null)) return state;
        if (!visible) {
          entry.gridItem = null;
        } else {
          // Search smaller entries for an x/y seed, skipping hidden placements.
          const smaller =
            breakpoint === "xl"
              ? [brick.lg, brick.md, brick.sm]
              : breakpoint === "lg"
                ? [brick.md, brick.sm]
                : breakpoint === "md"
                  ? [brick.sm]
                  : [];
          const placement = smaller.find(candidate => candidate.gridItem)?.gridItem;
          const brickModule = modulesHash[brick.moduleId];
          if (!brickModule) return state;
          const declaredW = brickModule.def[breakpoint].w;
          const declaredH = brickModule.def[breakpoint].h;
          const hasDeclaredSize = declaredW !== undefined && declaredH !== undefined;
          if (hasDeclaredSize) {
            if (placement) {
              entry.gridItem = { ...placement, i: brickId };
            } else {
              let y = 0;
              for (const other of Object.values(state.bricksById)) {
                const item = other[breakpoint].gridItem;
                if (item) y = Math.max(y, item.y + item.h);
              }
              entry.gridItem = {
                i: brickId,
                x: 0,
                y,
                w: declaredW,
                h: declaredH,
              };
            }
          } else {
            if (gridSize === undefined) return state;
            let y = 0;
            for (const other of Object.values(state.bricksById)) {
              const item = other[breakpoint].gridItem;
              if (item) y = Math.max(y, item.y + item.h);
            }
            entry.gridItem = {
              i: brickId,
              x: placement?.x ?? 0,
              y: placement?.y ?? y,
              w: gridSize.w,
              h: gridSize.h,
            };
          }
        }
        const nextBricksById = {
          ...state.bricksById,
          [brickId]: { ...brick, [breakpoint]: entry },
        };
        const layout = Object.values(nextBricksById).flatMap(placed => {
          const item = placed[breakpoint].gridItem;
          return item ? [{ ...item }] : [];
        });
        for (const item of verticalCompactor.compact(layout, 8)) {
          const placed = nextBricksById[item.i];
          const resolved = placed[breakpoint];
          if (resolved.gridItem?.x === item.x && resolved.gridItem?.y === item.y) continue;
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
