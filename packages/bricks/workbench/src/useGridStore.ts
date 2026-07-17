import type { ICollectionBrickDef } from "@qrk.sh/bricks";
import type { Layout } from "react-grid-layout";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useGridStore = create<{
  collectionGrids: Record<
    string,
    {
      layout: Layout;
      gridBricksById: Record<string, ICollectionBrickDef>;
    }
  >;
  activeBrickDrag: ICollectionBrickDef | null;
  hasHydrated: boolean;
  ensureCollectionGrid: (collectionName: string) => void;
  setCollectionLayout: (collectionName: string, layout: Layout) => void;
  addGridBrick: (
    collectionName: string,
    gridBrickId: string,
    brickDef: ICollectionBrickDef,
    layout: Layout,
  ) => void;
  setActiveBrickDrag: (brickDef: ICollectionBrickDef | null) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}>()(
  persist(
    (set, get) => ({
      collectionGrids: {},
      activeBrickDrag: null,
      hasHydrated: false,
      ensureCollectionGrid: (collectionName) => {
        const currentCollectionGrids = get().collectionGrids;
        if (currentCollectionGrids[collectionName]) {
          return;
        }

        set({
          collectionGrids: {
            ...currentCollectionGrids,
            [collectionName]: {
              layout: [
                { i: "fixture-1", x: 0, y: 0, w: 2, h: 2 },
                { i: "fixture-2", x: 2, y: 0, w: 2, h: 2 },
                { i: "fixture-3", x: 4, y: 0, w: 2, h: 2 },
                { i: "fixture-4", x: 6, y: 0, w: 2, h: 2 },
              ],
              gridBricksById: {},
            },
          },
        });
      },
      setCollectionLayout: (collectionName, layout) => {
        const currentCollectionGrids = get().collectionGrids;
        const currentCollectionGrid = currentCollectionGrids[collectionName];
        if (!currentCollectionGrid) {
          return;
        }

        set({
          collectionGrids: {
            ...currentCollectionGrids,
            [collectionName]: {
              ...currentCollectionGrid,
              layout,
            },
          },
        });
      },
      addGridBrick: (collectionName, gridBrickId, brickDef, layout) => {
        const currentCollectionGrids = get().collectionGrids;
        const currentCollectionGrid = currentCollectionGrids[collectionName];
        if (!currentCollectionGrid) {
          return;
        }

        set({
          collectionGrids: {
            ...currentCollectionGrids,
            [collectionName]: {
              layout,
              gridBricksById: {
                ...currentCollectionGrid.gridBricksById,
                [gridBrickId]: brickDef,
              },
            },
          },
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
      name: "qrk-bricks-sandbox-grid",
      partialize: (state) => ({ collectionGrids: state.collectionGrids }),
      skipHydration: true,
      onRehydrateStorage: (stateBeforeHydration) => (stateAfterHydration) => {
        (stateAfterHydration ?? stateBeforeHydration).setHasHydrated(true);
      },
    },
  ),
);
