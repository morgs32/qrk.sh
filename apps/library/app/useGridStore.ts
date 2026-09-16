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
      sm: { gridItem: LayoutItem | null; options: unknown };
    } & Partial<Record<"md" | "lg" | "xl", { gridItem: LayoutItem | null; options: unknown }>>
  >;
  activeBrickDrag: (IModuleBrickDef & { options?: unknown }) | null;
  hasHydrated: boolean;
  selectedWidth: number | null;
  setLayout: (layout: Layout, breakpoint: "sm" | "md" | "lg" | "xl") => void;
  addBrick: (
    brickId: string,
    brickDef: IModuleBrickDef & { options?: unknown },
    layout: Layout,
    breakpoint: "sm" | "md" | "lg" | "xl",
  ) => void;
  setActiveBrickDrag: (brickDef: (IModuleBrickDef & { options?: unknown }) | null) => void;
  setOptions: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", value: unknown) => void;
  setVisible: (brickId: string, breakpoint: "sm" | "md" | "lg" | "xl", visible: boolean) => void;
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
        const brickModule = modulesHash[brickDef.moduleId];
        const options = brickModule?.component.options
          ? brickModule.component.options.decode(
              brickDef.options ?? brickModule.component.options.defaultValue,
            )
          : {};
        set((state) => ({
          bricksById: {
            ...state.bricksById,
            [brickId]: {
              moduleId: brickDef.moduleId,

              data: structuredClone(brickDef.data),
              sm: {
                gridItem: { ...gridItem },
                options: structuredClone(options),
              },
              ...(breakpoint === "sm"
                ? {}
                : {
                    [breakpoint]: {
                      gridItem: { ...gridItem },
                      options: structuredClone(options),
                    },
                  }),
            },
          },
        }));
        useGridStore.getState().setLayout(layout, breakpoint);
      },
      setOptions: (brickId, breakpoint, value) => {
        set((state) => {
          const brick = state.bricksById[brickId];
          if (!brick) return state;
          const optionsConfig = modulesHash[brick.moduleId]?.component.options;
          if (!optionsConfig) return state;
          const options = optionsConfig.decode(value);
          const entry = structuredClone(resolveBrickBreakpoint(brick, breakpoint));
          return {
            bricksById: {
              ...state.bricksById,
              [brickId]: {
                ...brick,
                [breakpoint]: {
                  ...entry,
                  options: structuredClone(options),
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
    }),
    {
      name: "qrk-bricks-sandbox-responsive-bricks-v5",
      version: 5,
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
        if (state.selectedWidth === 375) state.selectedWidth = 360;
        if (state.selectedWidth === 640 || state.selectedWidth === 768) state.selectedWidth = 720;
        if (state.selectedWidth === 1024 || state.selectedWidth === 1280) {
          state.selectedWidth = 1080;
        }
        if (state.selectedWidth === 1536) state.selectedWidth = 1440;
        state.setHasHydrated(true);
      },
    },
  ),
);
