import { create } from "zustand";

import { seedLayout, type ILayout } from "@/components/home/seedLayout";

type GridLayoutState = {
  layout: ILayout;
  setLayout: (layout: ILayout) => void;
  zoomIn: boolean;
  setZoomIn: (zoomIn: boolean) => void;
};

export const useGridLayoutStore = create<GridLayoutState>((set) => ({
  layout: seedLayout,
  setLayout: (layout) => set({ layout }),
  zoomIn: true,
  setZoomIn: (zoomIn) => set({ zoomIn }),
}));
