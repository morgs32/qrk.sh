import { create } from "zustand";

/** Ephemeral preview width for the /breakpoints route (not persisted). */
export const useBreakpointsPreviewStore = create<{
  selectedWidth: number | null;
  setSelectedWidth: (width: number | null) => void;
}>((set) => ({
  selectedWidth: null,
  setSelectedWidth: (width) => set({ selectedWidth: width }),
}));
