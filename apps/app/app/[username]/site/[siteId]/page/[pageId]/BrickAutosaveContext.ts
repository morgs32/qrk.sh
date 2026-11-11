import { createContext } from "react";

export const BrickAutosaveContext = createContext<{
  registerBrickFlush: (brickId: string, flush: (onRecover?: () => void) => boolean) => () => void;
  flushBrick: (brickId: string) => boolean;
  flushPageEditors: (onRecover?: () => void) => boolean;
} | null>(null);
