import { createContext } from "react";

/** Only placed Text bricks report natural height to the active wall. */
export const TextBrickEditingContext = createContext<{
  isActive: boolean;
  measurementEpoch: string;
  onNaturalHeight: (height: number) => void;
} | null>(null);
