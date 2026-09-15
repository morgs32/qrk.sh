import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { useCallback } from "react";
import { create } from "zustand";
import { catalogsHash } from "../catalogsHash";

export const useContentDataStore = create<{
  dataByCatalog: Record<string, Record<string, unknown>>;
  setContentData: (catalogName: string, contentName: string, data: unknown) => void;
}>((set) => ({
  dataByCatalog: {},
  setContentData: (catalogName, contentName, data) => {
    const content = catalogsHash[catalogName]?.contents[contentName];
    if (content === undefined) throw new Error("Content not found");

    // Decode before changing state: failed writes leave the last preview intact.
    const DataSchema =
      content.dataShape === null ? Schema.Null : Schema.toType(makeEffectSchema(content.dataShape));
    const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
      onExcessProperty: "preserve",
    });
    set((state) => ({
      dataByCatalog: {
        ...state.dataByCatalog,
        [catalogName]: {
          ...state.dataByCatalog[catalogName],
          [contentName]: decodedData,
        },
      },
    }));
  },
}));

export function useContentData(
  catalogName: string,
  contentName: string,
): [unknown, (data: unknown) => void] {
  const contentData = useContentDataStore((state) => {
    const catalogData = state.dataByCatalog[catalogName];
    if (catalogData !== undefined && Object.hasOwn(catalogData, contentName)) {
      return catalogData[contentName];
    }
    return catalogsHash[catalogName]?.contents[contentName]?.defaultData;
  });
  const setContentData = useCallback(
    (data: unknown) => {
      useContentDataStore.getState().setContentData(catalogName, contentName, data);
    },
    [catalogName, contentName],
  );

  return [contentData, setContentData];
}
