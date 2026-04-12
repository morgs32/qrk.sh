import { create } from "zustand";

import { seedLayout, type ILayout } from "@/components/home/seedLayout";

type GridLayoutState = {
  layout: ILayout;
  setLayout: (layout: ILayout) => void;
};

export const useGridLayoutStore = create<GridLayoutState>((set) => ({
  layout: seedLayout,
  setLayout: (layout) => set({ layout }),
}));
