import type { ICollectionBrickDef } from "@qrk.sh/bricks";
import type { Layout } from "react-grid-layout";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useGridStore = create<{
  layout: Layout;
  bricksById: Record<string, ICollectionBrickDef>;
  activeBrickDrag: ICollectionBrickDef | null;
  hasHydrated: boolean;
  setLayout: (layout: Layout) => void;
  addBrick: (brickId: string, brickDef: ICollectionBrickDef, layout: Layout) => void;
  setActiveBrickDrag: (brickDef: ICollectionBrickDef | null) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}>()(
  persist(
    (set) => ({
      layout: [
        { i: "fixture-1", x: 0, y: 0, w: 2, h: 2 },
        { i: "fixture-2", x: 2, y: 0, w: 2, h: 2 },
        { i: "fixture-3", x: 4, y: 0, w: 2, h: 2 },
        { i: "fixture-4", x: 6, y: 0, w: 2, h: 2 },
      ],
      bricksById: {},
      activeBrickDrag: null,
      hasHydrated: false,
      setLayout: (layout) => {
        set({ layout });
      },
      addBrick: (brickId, brickDef, layout) => {
        set((state) => ({
          layout,
          bricksById: {
            ...state.bricksById,
            [brickId]: brickDef,
          },
        }));
      },
      setActiveBrickDrag: (brickDef) => {
        set({ activeBrickDrag: brickDef });
      },
      setHasHydrated: (hasHydrated) => {
        set({ hasHydrated });
      },
    }),
    {
      name: "qrk-bricks-sandbox-single-grid",
      partialize: (state) => ({
        layout: state.layout,
        bricksById: state.bricksById,
      }),
      skipHydration: true,
      onRehydrateStorage: (stateBeforeHydration) => (stateAfterHydration) => {
        (stateAfterHydration ?? stateBeforeHydration).setHasHydrated(true);
      },
    },
  ),
);
