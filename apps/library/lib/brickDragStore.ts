import type { Spec } from "@json-render/core";
import { create } from "zustand";

import type { IBackendLibrary } from "../backendLibrary";

/** In-app drag payload; its module identity comes from the registered library. */
export type IDraggedBrick = {
  moduleId: keyof IBackendLibrary;
  state: unknown;
  spec: Spec;
  w: number;
  h: number;
  placementSizes: Record<"sm" | "md" | "lg" | "xl", { w: number; h: number }>;
};

export const brickDragStore = create<{
  brickDef: IDraggedBrick | null;
  setBrickDef: (brickDef: IDraggedBrick | null) => void;
}>((set) => ({
  brickDef: null,
  setBrickDef: (brickDef) => {
    set({ brickDef });
  },
}));
