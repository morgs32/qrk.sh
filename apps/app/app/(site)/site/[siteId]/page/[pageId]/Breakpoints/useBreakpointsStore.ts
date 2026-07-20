import { create } from "zustand";

import { BREAKPOINT_ROWS, type BreakpointPrefix } from "./breakpointRows";

type BreakpointsState = {
  selectedPrefix: BreakpointPrefix | null;
  setSelectedPrefix: (prefix: BreakpointPrefix | null) => void;
  gridColumnCount: 1 | 2;
  setGridColumnCount: (count: 1 | 2) => void;
};

export const useBreakpointsStore = create<BreakpointsState>((set) => ({
  selectedPrefix: BREAKPOINT_ROWS[0].prefix,
  setSelectedPrefix: (prefix) => set({ selectedPrefix: prefix }),
  gridColumnCount: 1,
  setGridColumnCount: (count) => set({ gridColumnCount: count }),
}));
