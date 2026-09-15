import { create } from "zustand";

/** Ephemeral preview width for the /breakpoints route (not persisted). */
export const useBreakpointsPreviewStore = create<{
  selectedWidth: number | null;
  availableWidth: number;
  setSelectedWidth: (width: number | null) => void;
  setAvailableWidth: (width: number) => void;
}>((set) => ({
  selectedWidth: null,
  availableWidth: 0,
  setSelectedWidth: (width) => set({ selectedWidth: width }),
  setAvailableWidth: (width) => set({ availableWidth: width }),
}));
