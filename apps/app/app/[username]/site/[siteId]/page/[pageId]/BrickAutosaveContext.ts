import { createContext } from "react";

export const BrickAutosaveContext = createContext<{
  registerBrickFlush: (brickId: string, flush: () => boolean) => () => void;
  flushBrick: (brickId: string) => boolean;
  flushPageEditors: () => boolean;
} | null>(null);
