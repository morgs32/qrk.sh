import { useCallback } from "react";

import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { create } from "zustand";

import { groupsHash } from "../groupsHash";

export const useCatalogDataStore = create<{
  dataByGroup: Record<string, Record<string, unknown>>;
  setCatalogData: (groupName: string, catalogName: string, data: unknown) => void;
}>((set) => ({
  dataByGroup: {},
  setCatalogData: (groupName, catalogName, data) => {
    const catalog = groupsHash[groupName]?.catalogs[catalogName];
    if (catalog === undefined) throw new Error("Catalog not found");

    // Decode before changing state: failed writes leave the last preview intact.
    const DataSchema =
      catalog.dataShape === null ? Schema.Null : Schema.toType(makeEffectSchema(catalog.dataShape));
    const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
      onExcessProperty: "preserve",
    });
    set((state) => ({
      dataByGroup: {
        ...state.dataByGroup,
        [groupName]: {
          ...state.dataByGroup[groupName],
          [catalogName]: decodedData,
        },
      },
    }));
  },
}));

export function useCatalogData(
  groupName: string,
  catalogName: string,
): [unknown, (data: unknown) => void] {
  const catalogData = useCatalogDataStore((state) => {
    const groupData = state.dataByGroup[groupName];
    if (groupData !== undefined && Object.hasOwn(groupData, catalogName)) {
      return groupData[catalogName];
    }
    return groupsHash[groupName]?.catalogs[catalogName]?.defaultData;
  });
  const setCatalogData = useCallback(
    (data: unknown) => {
      useCatalogDataStore.getState().setCatalogData(groupName, catalogName, data);
    },
    [groupName, catalogName],
  );

  return [catalogData, setCatalogData];
}
