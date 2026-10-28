import { create } from "zustand";

export const useEditorViewportStore = create<{
  /** Page-content capacity after reserving the scrollbar and both preview borders. */
  availableWidth: number | null;
  setAvailableWidth: (width: number | null) => void;
}>()((set) => ({
  availableWidth: null,
  setAvailableWidth: (availableWidth) => set({ availableWidth }),
}));
