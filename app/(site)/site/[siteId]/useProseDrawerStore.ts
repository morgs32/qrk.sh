import { create } from "zustand";

type EditorBlock = {
  id: string;
  content: string;
};

type ProseDrawerState = {
  blocks: EditorBlock[];
  addBlock: () => void;
  updateBlock: (id: string, content: string) => void;
  removeBlock: (id: string) => void;
};

export const useProseDrawerStore = create<ProseDrawerState>((set) => ({
  blocks: [{ id: crypto.randomUUID(), content: "" }],
  addBlock: () =>
    set((state) => ({
      blocks: [...state.blocks, { id: crypto.randomUUID(), content: "" }],
    })),
  updateBlock: (id, content) =>
    set((state) => ({
      blocks: state.blocks.map((block) => (block.id === id ? { ...block, content } : block)),
    })),
  removeBlock: (id) =>
    set((state) => ({
      blocks: state.blocks.filter((block) => block.id !== id),
    })),
}));
