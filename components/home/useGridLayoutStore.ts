import { create } from "zustand";
import type { Layout } from "react-grid-layout";

import { seedLayout } from "@/components/home/seedLayout";

type GridLayoutState = {
  layout: Layout;
  setLayout: (layout: Layout) => void;
};

export const useGridLayoutStore = create<GridLayoutState>((set) => ({
  layout: seedLayout,
  setLayout: (layout) => set({ layout }),
}));
