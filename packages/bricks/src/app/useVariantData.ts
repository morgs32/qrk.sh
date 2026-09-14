import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { useCallback } from "react";
import { create } from "zustand";
import { collectionsHash } from "../collectionsHash";

export const useVariantDataStore = create<{
  dataByCollection: Record<string, Record<string, unknown>>;
  setVariantData: (collectionName: string, variantName: string, data: unknown) => void;
}>((set) => ({
  dataByCollection: {},
  setVariantData: (collectionName, variantName, data) => {
    const variant = collectionsHash[collectionName]?.variants[variantName];
    if (variant === undefined) throw new Error("Variant not found");

    // Decode before changing state: failed writes leave the last preview intact.
    const DataSchema =
      variant.dataShape === null ? Schema.Null : Schema.toType(makeEffectSchema(variant.dataShape));
    const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
      onExcessProperty: "preserve",
    });
    set((state) => ({
      dataByCollection: {
        ...state.dataByCollection,
        [collectionName]: {
          ...state.dataByCollection[collectionName],
          [variantName]: decodedData,
        },
      },
    }));
  },
}));

export function useVariantData(
  collectionName: string,
  variantName: string,
): [unknown, (data: unknown) => void] {
  const variantData = useVariantDataStore((state) => {
    const collectionData = state.dataByCollection[collectionName];
    if (collectionData !== undefined && Object.hasOwn(collectionData, variantName)) {
      return collectionData[variantName];
    }
    return collectionsHash[collectionName]?.variants[variantName]?.defaultData;
  });
  const setVariantData = useCallback(
    (data: unknown) => {
      useVariantDataStore.getState().setVariantData(collectionName, variantName, data);
    },
    [collectionName, variantName],
  );

  return [variantData, setVariantData];
}
