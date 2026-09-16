import { useCallback } from "react";

import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { create } from "zustand";

import { modulesHash } from "../modulesHash";

export const useModuleDataStore = create<{
  dataByModule: Record<string, unknown>;
  setModuleData: (moduleId: string, data: unknown) => void;
}>((set) => ({
  dataByModule: {},
  setModuleData: (moduleId, data) => {
    const brickModule = modulesHash[moduleId];
    if (brickModule === undefined) throw new Error("Module not found");

    // Decode before changing state: failed writes leave the last preview intact.
    const DataSchema =
      brickModule.dataShape === null
        ? Schema.Null
        : Schema.toType(makeEffectSchema(brickModule.dataShape));
    const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
      onExcessProperty: "preserve"});
    set((state) => ({
      dataByModule: {
        ...state.dataByModule,
        [moduleId]: decodedData}}));
  }}));

export function useModuleData(moduleId: string): [unknown, (data: unknown) => void] {
  const moduleData = useModuleDataStore((state) => {
    if (Object.hasOwn(state.dataByModule, moduleId)) {
      return state.dataByModule[moduleId];
    }
    return modulesHash[moduleId]?.defaultData;
  });
  const setModuleData = useCallback(
    (data: unknown) => {
      useModuleDataStore.getState().setModuleData(moduleId, data);
    },
    [moduleId],
  );

  return [moduleData, setModuleData];
}
