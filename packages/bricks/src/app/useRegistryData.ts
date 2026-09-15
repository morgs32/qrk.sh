import { useCallback } from "react";

import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { create } from "zustand";

import { catalogsHash } from "../catalogsHash";

export const useRegistryDataStore = create<{
  dataByCatalog: Record<string, Record<string, unknown>>;
  setRegistryData: (catalogName: string, registryName: string, data: unknown) => void;
}>((set) => ({
  dataByCatalog: {},
  setRegistryData: (catalogName, registryName, data) => {
    const registry = catalogsHash[catalogName]?.registries[registryName];
    if (registry === undefined) throw new Error("Registry not found");

    // Decode before changing state: failed writes leave the last preview intact.
    const DataSchema =
      registry.dataShape === null
        ? Schema.Null
        : Schema.toType(makeEffectSchema(registry.dataShape));
    const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
      onExcessProperty: "preserve",
    });
    set((state) => ({
      dataByCatalog: {
        ...state.dataByCatalog,
        [catalogName]: {
          ...state.dataByCatalog[catalogName],
          [registryName]: decodedData,
        },
      },
    }));
  },
}));

export function useRegistryData(
  catalogName: string,
  registryName: string,
): [unknown, (data: unknown) => void] {
  const registryData = useRegistryDataStore((state) => {
    const catalogData = state.dataByCatalog[catalogName];
    if (catalogData !== undefined && Object.hasOwn(catalogData, registryName)) {
      return catalogData[registryName];
    }
    return catalogsHash[catalogName]?.registries[registryName]?.defaultData;
  });
  const setRegistryData = useCallback(
    (data: unknown) => {
      useRegistryDataStore.getState().setRegistryData(catalogName, registryName, data);
    },
    [catalogName, registryName],
  );

  return [registryData, setRegistryData];
}
