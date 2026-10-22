import { create } from "zustand";

export const useEditorViewportStore = create<{
  availableWidth: number | null;
  setAvailableWidth: (width: number | null) => void;
}>()((set) => ({
  availableWidth: null,
  setAvailableWidth: (availableWidth) => set({ availableWidth }),
}));
