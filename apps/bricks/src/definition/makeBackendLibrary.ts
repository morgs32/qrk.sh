import { mapValues } from "es-toolkit";

/** Worker-safe library entries: `makeModuleVersion` results keyed by id. */
export function makeBackendLibrary<
  const ENTRIES extends {
    readonly [moduleId: string]: {
      readonly id: string;
    };
  },
>(entries: ENTRIES): ENTRIES {
  mapValues(entries, (brickModule, moduleId) => {
    if (brickModule.id !== moduleId) {
      throw new Error(
        `makeBackendLibrary: module id ${JSON.stringify(brickModule.id)} does not match key ${JSON.stringify(moduleId)}`,
      );
    }
  });
  return entries;
}
