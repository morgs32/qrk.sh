"use client";

import { createContext, useContext, useLayoutEffect } from "react";

export const BrickInsertionContext = createContext<((action: () => void) => void) | null>(null);

export function useAfterBrickInserted(action: () => void) {
  const runAfterInsert = useContext(BrickInsertionContext);

  useLayoutEffect(() => {
    runAfterInsert?.(action);
  }, [runAfterInsert, action]);
}
