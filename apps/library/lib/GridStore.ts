import type { Spec } from "@json-render/core";
import { create } from "zustand";

import type { IModuleBrickDef } from "./types";

export const brickDragStore = create<{
  brickDef:
    | (IModuleBrickDef & {
        spec: Spec;
        w: number;
        h: number;
        placementSizes: Record<"sm" | "md" | "lg" | "xl", { w: number; h: number }>;
      })
    | null;
  setBrickDef: (
    brickDef:
      | (IModuleBrickDef & {
          spec: Spec;
          w: number;
          h: number;
          placementSizes: Record<"sm" | "md" | "lg" | "xl", { w: number; h: number }>;
        })
      | null,
  ) => void;
}>((set) => ({
  brickDef: null,
  setBrickDef: (brickDef) => {
    set({ brickDef });
  },
}));
