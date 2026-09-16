import type { Catalog } from "@json-render/core";

/** Worker-safe library entries: catalogs and other non-React module facts. */
export function makeBackendLibrary<
  const ENTRIES extends {
    readonly [moduleId: string]: {
      readonly catalog: Catalog;
    };
  },
>(entries: ENTRIES): ENTRIES {
  return entries;
}
