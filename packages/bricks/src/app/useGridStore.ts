import { verticalCompactor } from "react-grid-layout";
import type { ICollectionBrickDef } from "../types";
import type { Layout, LayoutItem } from "react-grid-layout";
import { create } from "zustand";
import { collectionsHash } from "../collectionsHash";
import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";
import { persist } from "zustand/middleware";

export const useGridStore = create<{
  bricksById: Record<
    string,
    {
      collectionId: string;
      contentId: string;
      viewId: string;
      data: unknown;
      xs: { gridItem: LayoutItem | null; viewOptions: unknown };
    } & Partial<Record<"sm" | "md" | "lg", { gridItem: LayoutItem | null; viewOptions: unknown }>>
  >;
  activeBrickDrag: (ICollectionBrickDef & { viewOptions?: unknown }) | null;
  hasHydrated: boolean;
  selectedWidth: number | null;
  setLayout: (layout: Layout, breakpoint: "xs" | "sm" | "md" | "lg") => void;
  addBrick: (
    brickId: string,
    brickDef: ICollectionBrickDef & { viewOptions?: unknown },
    layout: Layout,
    breakpoint: "xs" | "sm" | "md" | "lg",
  ) => void;
  setActiveBrickDrag: (brickDef: (ICollectionBrickDef & { viewOptions?: unknown }) | null) => void;
  setViewOptions: (brickId: string, breakpoint: "xs" | "sm" | "md" | "lg", value: unknown) => void;
  setVisible: (brickId: string, breakpoint: "xs" | "sm" | "md" | "lg", visible: boolean) => void;
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
              [breakpoint]: { ...structuredClone(resolved), gridItem: { ...gridItem } },
            };
          }
          return { bricksById };
        });
      },
      addBrick: (brickId, brickDef, layout, breakpoint) => {
        const gridItem = layout.find((item) => item.i === brickId);
        if (!gridItem) return;
        const catalog =
          collectionsHash[brickDef.collectionName]?.contents[brickDef.content]?.views[
            brickDef.view
          ];
        const viewOptions = catalog?.component.form
          ? catalog.component.form.decode(
              brickDef.viewOptions ?? catalog.component.form.defaultValue,
            )
          : {};
        set((state) => ({
          bricksById: {
            ...state.bricksById,
            [brickId]: {
              collectionId: brickDef.collectionName,
              contentId: brickDef.content,
              viewId: brickDef.view,
              data: structuredClone(brickDef.data),
              xs: { gridItem: { ...gridItem }, viewOptions: structuredClone(viewOptions) },
              ...(breakpoint === "xs"
                ? {}
                : {
                    [breakpoint]: {
                      gridItem: { ...gridItem },
                      viewOptions: structuredClone(viewOptions),
                    },
                  }),
            },
          },
        }));
        useGridStore.getState().setLayout(layout, breakpoint);
      },
      setViewOptions: (brickId, breakpoint, value) => {
        set((state) => {
          const brick = state.bricksById[brickId];
          if (!brick) return state;
          const form =
            collectionsHash[brick.collectionId]?.contents[brick.contentId]?.views[brick.viewId]
              ?.component.form;
          if (!form) return state;
          const viewOptions = form.decode(value);
          const entry = structuredClone(resolveBrickBreakpoint(brick, breakpoint));
          return {
            bricksById: {
              ...state.bricksById,
              [brickId]: {
                ...brick,
                [breakpoint]: { ...entry, viewOptions: structuredClone(viewOptions) },
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
              breakpoint === "lg"
                ? [brick.md, brick.sm, brick.xs]
                : breakpoint === "md"
                  ? [brick.sm, brick.xs]
                  : breakpoint === "sm"
                    ? [brick.xs]
                    : [];
            const placement = smaller.find((candidate) => candidate?.gridItem)?.gridItem;
            if (placement) {
              entry.gridItem = { ...placement, i: brickId };
            } else {
              const catalog =
                collectionsHash[brick.collectionId]?.contents[brick.contentId]?.views[brick.viewId];
              if (!catalog) return state;
              let y = 0;
              for (const other of Object.values(state.bricksById)) {
                const item = resolveBrickBreakpoint(other, breakpoint).gridItem;
                if (item) y = Math.max(y, item.y + item.h);
              }
              entry.gridItem = { i: brickId, x: 0, y, w: catalog.def.w, h: catalog.def.h };
            }
          }
          const bricksById = { ...state.bricksById, [brickId]: { ...brick, [breakpoint]: entry } };
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
              [breakpoint]: { ...structuredClone(resolved), gridItem: { ...item } },
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
      name: "qrk-bricks-sandbox-responsive-bricks-v2",
      partialize: (state) => ({
        bricksById: state.bricksById,
        selectedWidth: state.selectedWidth,
      }),
      skipHydration: true,
      onRehydrateStorage: (stateBeforeHydration) => (stateAfterHydration) => {
        const state = stateAfterHydration ?? stateBeforeHydration;
        state.setHasHydrated(true);
      },
    },
  ),
);
