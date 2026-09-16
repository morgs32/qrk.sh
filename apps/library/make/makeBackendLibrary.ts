import type { Catalog, Spec } from "@json-render/core";

/** Worker-safe library entries: catalogs and default specs. */
export function makeBackendLibrary<
  const ENTRIES extends {
    readonly [moduleId: string]: {
      readonly catalog: Catalog;
      readonly defaultSpec: Spec;
    };
  },
>(entries: ENTRIES): ENTRIES {
  return entries;
}
