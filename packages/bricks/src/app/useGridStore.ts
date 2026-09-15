import { verticalCompactor } from "react-grid-layout";
import type { ICatalogBrickDef } from "../types";
import type { Layout, LayoutItem } from "react-grid-layout";
import { create } from "zustand";
import { catalogsHash } from "../catalogsHash";
import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";
import { persist } from "zustand/middleware";

export const useGridStore = create<{
  bricksById: Record<
    string,
    {
      catalogId: string;
      contentId: string;
      viewId: string;
      data: unknown;
      xs: { gridItem: LayoutItem | null; viewOptions: unknown };
    } & Partial<
      Record<
        "sm" | "lg" | "xl",
        { gridItem: LayoutItem | null; viewOptions: unknown }
      >
    >
  >;
  activeBrickDrag: (ICatalogBrickDef & { viewOptions?: unknown }) | null;
  hasHydrated: boolean;
  selectedWidth: number | null;
  setLayout: (layout: Layout, breakpoint: "xs" | "sm" | "lg" | "xl") => void;
  addBrick: (
    brickId: string,
    brickDef: ICatalogBrickDef & { viewOptions?: unknown },
    layout: Layout,
    breakpoint: "xs" | "sm" | "lg" | "xl",
  ) => void;
  setActiveBrickDrag: (brickDef: (ICatalogBrickDef & { viewOptions?: unknown }) | null) => void;
  setViewOptions: (brickId: string, breakpoint: "xs" | "sm" | "lg" | "xl", value: unknown) => void;
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
          catalogsHash[brickDef.catalogName]?.contents[brickDef.content]?.views[
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
              catalogId: brickDef.catalogName,
              contentId: brickDef.content,
              viewId: brickDef.view,
              data: structuredClone(brickDef.data),
              xs: {
                gridItem: { ...gridItem },
                viewOptions: structuredClone(viewOptions),
              },
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
            catalogsHash[brick.catalogId]?.contents[brick.contentId]?.views[brick.viewId]
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
              const catalog =
                catalogsHash[brick.catalogId]?.contents[brick.contentId]?.views[brick.viewId];
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
        if (state.selectedWidth === 768) state.selectedWidth = 640;
        if (state.selectedWidth === 1536) state.selectedWidth = 1440;
        // Upgrade existing entries without resetting placements or materializing inheritance.
        for (const brick of Object.values(state.bricksById)) {
          if ("md" in brick) delete brick.md;
          if ("2xl" in brick) delete brick["2xl"];
          for (const entry of [brick.xs, brick.sm, brick.lg, brick.xl]) {
            if (!entry) continue;
            if ("frame" in entry) delete entry.frame;
            if (
              brick.catalogId === "github" &&
              brick.contentId === "profile" &&
              brick.viewId === "4x4" &&
              typeof entry.viewOptions === "object" &&
              entry.viewOptions !== null &&
              "cardView" in entry.viewOptions
            ) {
              delete entry.viewOptions.cardView;
            }
          }
        }
        // This update also persists the upgraded entries under the existing storage key.
        state.setHasHydrated(true);
      },
    },
  ),
);
