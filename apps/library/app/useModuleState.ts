import { useCallback } from "react";

import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { create } from "zustand";

import { modulesHash } from "../lib/modulesHash";

export const useModuleStateStore = create<{
  stateByModule: Record<string, unknown>;
  setModuleState: (moduleId: string, state: unknown) => void;
}>(set => ({
  stateByModule: {},
  setModuleState: (moduleId, nextState) => {
    const brickModule = modulesHash[moduleId];
    if (brickModule === undefined) throw new Error("Module not found");

    // Decode before changing state: failed writes leave the last preview intact.
    const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
    const decodedState = Schema.decodeUnknownSync(StateSchema)(nextState, {
      onExcessProperty: "preserve",
    });
    set(store => ({
      stateByModule: {
        ...store.stateByModule,
        [moduleId]: decodedState,
      },
    }));
  },
}));

export function useModuleState(moduleId: string): [unknown, (state: unknown) => void] {
  const moduleState = useModuleStateStore(store => {
    if (Object.hasOwn(store.stateByModule, moduleId)) {
      return store.stateByModule[moduleId];
    }
    return modulesHash[moduleId]?.defaultState;
  });
  const setModuleState = useCallback(
    (nextState: unknown) => {
      useModuleStateStore.getState().setModuleState(moduleId, nextState);
    },
    [moduleId],
  );

  return [moduleState, setModuleState];
}
