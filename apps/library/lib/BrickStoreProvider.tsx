"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Spec } from "@json-render/core";
import { verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import { create, useStore } from "zustand";

import { modulesHash } from "./modulesHash";
import type { IModuleBrickDef } from "./types";
import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";

function createBricksStore(initialState?: {
  bricksById?: Record<
    string,
    {
      moduleId: string;
      data: unknown;
      sm: { gridItem: LayoutItem | null; breakpointOptions: unknown; spec?: Spec };
    } & Partial<
      Record<"md" | "lg" | "xl", { gridItem: LayoutItem | null; breakpointOptions: unknown; spec?: Spec }>
    >
  >;
  selectedWidth?: number | null;
}) {
  return create<{
    bricksById: Record<
      string,
      {
        moduleId: string;
        data: unknown;
        sm: { gridItem: LayoutItem | null; breakpointOptions: unknown; spec?: Spec };
      } & Partial<
        Record<"md" | "lg" | "xl", { gridItem: LayoutItem | null; breakpointOptions: unknown; spec?: Spec }>
      >
    >;
    activeBrickDrag: (IModuleBrickDef & { breakpointOptions?: unknown }) | null;
    hasHydrated: boolean;
    selectedWidth: number | null;
    setLayout: (layout: Layout, breakpoint: "sm" | "md" | "lg" | "xl") => void;
    addBrick: (
      brickId: string,
      brickDef: IModuleBrickDef & { breakpointOptions?: unknown },
      layout: Layout,
      breakpoint: "sm" | "md" | "lg" | "xl",
    ) => void;
    setActiveBrickDrag: (brickDef: (IModuleBrickDef & { breakpointOptions?: unknown }) | null) => void;
    setBreakpointOptions: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", value: unknown) => void;
    setSpec: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", spec: Spec) => void;
    setVisible: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", visible: boolean) => void;
    setHasHydrated: (hasHydrated: boolean) => void;
  }>()((set, get) => ({
    bricksById: initialState?.bricksById ?? {},
    activeBrickDrag: null,
    hasHydrated: true,
    selectedWidth: initialState?.selectedWidth ?? null,
    setLayout: (layout, breakpoint) => {
      set((state) => {
        const bricksById = { ...state.bricksById };
        for (const gridItem of layout) {
          const brick = bricksById[gridItem.i];
          if (!brick) continue;
          const resolved = resolveBrickBreakpoint(brick, breakpoint);
          // Mounting or switching widths must not materialize inherited entries.
          if (resolved.gridItem === null) continue;
          const previous = resolved.gridItem;
          if (
            previous.x === gridItem.x &&
            previous.y === gridItem.y &&
            previous.w === gridItem.w &&
            previous.h === gridItem.h
          )
            continue;
          bricksById[gridItem.i] = {
            ...brick,
            [breakpoint]: {
              ...structuredClone(resolved),
              gridItem: { ...gridItem },
            },
          };
        }
        return { bricksById };
      });
    },
    addBrick: (brickId, brickDef, layout, breakpoint) => {
      const gridItem = layout.find((item) => item.i === brickId);
      if (!gridItem) return;
      const brickModule = modulesHash[brickDef.moduleId];
      const dropOptions = brickModule?.breakpoints[breakpoint].options;
      const smOptions = brickModule?.breakpoints.sm.options;
      const smBreakpointOptions = smOptions
        ? smOptions.decode(breakpoint === "sm" ? brickDef.breakpointOptions : undefined)
        : {};
      const dropBreakpointOptions =
        dropOptions === undefined
          ? {}
          : dropOptions.decode(brickDef.breakpointOptions);
      set((state) => ({
        bricksById: {
          ...state.bricksById,
          [brickId]: {
            moduleId: brickDef.moduleId,
            data: structuredClone(brickDef.data),
            sm: {
              gridItem: { ...gridItem },
              breakpointOptions: structuredClone(smBreakpointOptions),
            },
            ...(breakpoint === "sm"
              ? {}
              : {
                  [breakpoint]: {
                    gridItem: { ...gridItem },
                    breakpointOptions: structuredClone(dropBreakpointOptions),
                  },
                }),
          },
        },
      }));
      get().setLayout(layout, breakpoint);
    },
    setBreakpointOptions: (brickId, breakpoint, value) => {
      set((state) => {
        const brick = state.bricksById[brickId];
        if (!brick) return state;
        const breakpointOptionsConfig = modulesHash[brick.moduleId]?.breakpoints[breakpoint].options;
        if (!breakpointOptionsConfig) return state;
        const breakpointOptions = breakpointOptionsConfig.decode(value);
        const entry = structuredClone(resolveBrickBreakpoint(brick, breakpoint));
        return {
          bricksById: {
            ...state.bricksById,
            [brickId]: {
              ...brick,
              [breakpoint]: {
                ...entry,
                breakpointOptions: structuredClone(breakpointOptions),
              },
            },
          },
        };
      });
    },
    setSpec: (brickId, breakpoint, spec) => {
      set((state) => {
        const brick = state.bricksById[brickId];
        if (!brick) return state;
        const entry = structuredClone(resolveBrickBreakpoint(brick, breakpoint));
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
      set((state) => {
        const brick = state.bricksById[brickId];
        if (!brick) return state;
        const entry = structuredClone(resolveBrickBreakpoint(brick, breakpoint));
        if (visible === (entry.gridItem !== null)) return state;
        if (!visible) {
          entry.gridItem = null;
        } else {
          // Search explicit smaller entries, skipping hidden entries.
          const smaller =
            breakpoint === "xl"
              ? [brick.lg, brick.md, brick.sm]
              : breakpoint === "lg"
                ? [brick.md, brick.sm]
                : breakpoint === "md"
                  ? [brick.sm]
                  : [];
          const placement = smaller.find((candidate) => candidate?.gridItem)?.gridItem;
          if (placement) {
            entry.gridItem = { ...placement, i: brickId };
          } else {
            const brickModule = modulesHash[brick.moduleId];
            if (!brickModule) return state;
            let y = 0;
            for (const other of Object.values(state.bricksById)) {
              const item = resolveBrickBreakpoint(other, breakpoint).gridItem;
              if (item) y = Math.max(y, item.y + item.h);
            }
            entry.gridItem = {
              i: brickId,
              x: 0,
              y,
              w: brickModule.def[breakpoint].w,
              h: brickModule.def[breakpoint].h,
            };
          }
        }
        const bricksById = {
          ...state.bricksById,
          [brickId]: { ...brick, [breakpoint]: entry },
        };
        const layout = Object.values(bricksById).flatMap((placed) => {
          const item = resolveBrickBreakpoint(placed, breakpoint).gridItem;
          return item ? [{ ...item }] : [];
        });
        for (const item of verticalCompactor.compact(layout, 8)) {
          const placed = bricksById[item.i];
          const resolved = resolveBrickBreakpoint(placed, breakpoint);
          if (resolved.gridItem?.x === item.x && resolved.gridItem?.y === item.y) continue;
          bricksById[item.i] = {
            ...placed,
            [breakpoint]: {
              ...structuredClone(resolved),
              gridItem: { ...item },
            },
          };
        }
        return { bricksById };
      });
    },
    setActiveBrickDrag: (brickDef) => {
      set({ activeBrickDrag: brickDef });
    },
    setHasHydrated: (hasHydrated) => {
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
    selectedWidth: number | null;
  }) => void;
}) {
  const [bricksStore] = useState(() => createBricksStore(props.initialState));

  useEffect(() => {
    if (props.onChange === undefined) return;
    const onChange = props.onChange;
    return bricksStore.subscribe((state) => {
      onChange({
        bricksById: state.bricksById,
        selectedWidth: state.selectedWidth,
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
