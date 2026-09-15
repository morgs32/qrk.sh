import { verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { modulesHash } from "../modulesHash";
import type { IModuleBrickDef } from "../types";

import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";

export const useGridStore = create<{
  bricksById: Record<
    string,
    {
      moduleId: string;

      data: unknown;
      xs: { gridItem: LayoutItem | null; appearanceOptions: unknown };
    } & Partial<
      Record<"sm" | "lg" | "xl", { gridItem: LayoutItem | null; appearanceOptions: unknown }>
    >
  >;
  activeBrickDrag: (IModuleBrickDef & { appearanceOptions?: unknown }) | null;
  hasHydrated: boolean;
  selectedWidth: number | null;
  setLayout: (layout: Layout, breakpoint: "xs" | "sm" | "lg" | "xl") => void;
  addBrick: (
    brickId: string,
    brickDef: IModuleBrickDef & { appearanceOptions?: unknown },
    layout: Layout,
    breakpoint: "xs" | "sm" | "lg" | "xl",
  ) => void;
  setActiveBrickDrag: (brickDef: (IModuleBrickDef & { appearanceOptions?: unknown }) | null) => void;
  setAppearanceOptions: (
    brickId: string,
    breakpoint: "xs" | "sm" | "lg" | "xl",
    value: unknown,
  ) => void;
  setVisible: (brickId: string, breakpoint: "xs" | "sm" | "lg" | "xl", visible: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}>()(
  persist(
    (set) => ({
      bricksById: {},
      activeBrickDrag: null,
      hasHydrated: false,
      selectedWidth: null,
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
        const module = modulesHash[brickDef.moduleId];
        const appearanceOptions = module?.component.form
          ? module.component.form.decode(
              brickDef.appearanceOptions ?? module.component.form.defaultValue,
            )
          : {};
        set((state) => ({
          bricksById: {
            ...state.bricksById,
            [brickId]: {
              moduleId: brickDef.moduleId,

              data: structuredClone(brickDef.data),
              xs: {
                gridItem: { ...gridItem },
                appearanceOptions: structuredClone(appearanceOptions),
              },
              ...(breakpoint === "xs"
                ? {}
                : {
                    [breakpoint]: {
                      gridItem: { ...gridItem },
                      appearanceOptions: structuredClone(appearanceOptions),
                    },
                  }),
            },
          },
        }));
        useGridStore.getState().setLayout(layout, breakpoint);
      },
      setAppearanceOptions: (brickId, breakpoint, value) => {
        set((state) => {
          const brick = state.bricksById[brickId];
          if (!brick) return state;
          const form = modulesHash[brick.moduleId]?.component.form;
          if (!form) return state;
          const appearanceOptions = form.decode(value);
          const entry = structuredClone(resolveBrickBreakpoint(brick, breakpoint));
          return {
            bricksById: {
              ...state.bricksById,
              [brickId]: {
                ...brick,
                [breakpoint]: {
                  ...entry,
                  appearanceOptions: structuredClone(appearanceOptions),
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
                ? [brick.lg, brick.sm, brick.xs]
                : breakpoint === "lg"
                  ? [brick.sm, brick.xs]
                  : breakpoint === "sm"
                    ? [brick.xs]
                    : [];
            const placement = smaller.find((candidate) => candidate?.gridItem)?.gridItem;
            if (placement) {
              entry.gridItem = { ...placement, i: brickId };
            } else {
              const module = modulesHash[brick.moduleId];
              if (!module) return state;
              let y = 0;
              for (const other of Object.values(state.bricksById)) {
                const item = resolveBrickBreakpoint(other, breakpoint).gridItem;
                if (item) y = Math.max(y, item.y + item.h);
              }
              entry.gridItem = {
                i: brickId,
                x: 0,
                y,
                w: module.def[breakpoint].w,
                h: module.def[breakpoint].h,
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
    }),
    {
      name: "qrk-bricks-sandbox-responsive-bricks-v3",
      version: 3,
      migrate: (persistedState) => {
        const selectedWidth =
          persistedState !== null &&
          typeof persistedState === "object" &&
          "selectedWidth" in persistedState &&
          typeof persistedState.selectedWidth === "number"
            ? persistedState.selectedWidth
            : null;
        return { bricksById: {}, selectedWidth };
      },
      partialize: (state) => ({
        bricksById: state.bricksById,
        selectedWidth: state.selectedWidth,
      }),
      skipHydration: true,
      onRehydrateStorage: (stateBeforeHydration) => (stateAfterHydration) => {
        const state = stateAfterHydration ?? stateBeforeHydration;
        if (state.selectedWidth === 768) state.selectedWidth = 640;
        if (state.selectedWidth === 1536) state.selectedWidth = 1440;
        state.setHasHydrated(true);
      },
    },
  ),
);
