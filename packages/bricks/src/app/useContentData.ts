import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { useCallback } from "react";
import { create } from "zustand";
import { collectionsHash } from "../collectionsHash";

export const useContentDataStore = create<{
  dataByCollection: Record<string, Record<string, unknown>>;
  setContentData: (collectionName: string, contentName: string, data: unknown) => void;
}>((set) => ({
  dataByCollection: {},
  setContentData: (collectionName, contentName, data) => {
    const content = collectionsHash[collectionName]?.contents[contentName];
    if (content === undefined) throw new Error("Content not found");

    // Decode before changing state: failed writes leave the last preview intact.
    const DataSchema =
      content.dataShape === null ? Schema.Null : Schema.toType(makeEffectSchema(content.dataShape));
    const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
      onExcessProperty: "preserve",
    });
    set((state) => ({
      dataByCollection: {
        ...state.dataByCollection,
        [collectionName]: {
          ...state.dataByCollection[collectionName],
          [contentName]: decodedData,
        },
      },
    }));
  },
}));

export function useContentData(
  collectionName: string,
  contentName: string,
): [unknown, (data: unknown) => void] {
  const contentData = useContentDataStore((state) => {
    const collectionData = state.dataByCollection[collectionName];
    if (collectionData !== undefined && Object.hasOwn(collectionData, contentName)) {
      return collectionData[contentName];
    }
    return collectionsHash[collectionName]?.contents[contentName]?.defaultData;
  });
  const setContentData = useCallback(
    (data: unknown) => {
      useContentDataStore.getState().setContentData(collectionName, contentName, data);
    },
    [collectionName, contentName],
  );

  return [contentData, setContentData];
}
