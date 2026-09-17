import { create } from "zustand";

/** Ephemeral page UI state for studio (not persisted). */
export const useStudioUIStore = create<{
  selectedWidth: number | null;
  setSelectedWidth: (width: number | null) => void;
}>((set) => ({
  selectedWidth: null,
  setSelectedWidth: (width) => set({ selectedWidth: width }),
}));
