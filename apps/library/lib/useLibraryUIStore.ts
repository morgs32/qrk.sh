import { create } from "zustand";

export const useLibraryUIStore = create<{
  selectedWidth: number | null;
  setSelectedWidth: (width: number | null) => void;
}>((set) => ({
  selectedWidth: null,
  setSelectedWidth: (width) => set({ selectedWidth: width }),
}));
