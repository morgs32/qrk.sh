/** Worker-safe library entries: `makeModuleVersion` results keyed by id. */
export function makeBackendLibrary<
  const ENTRIES extends {
    readonly [moduleId: string]: {
      readonly id: string;
      readonly catalog?: unknown;
    };
  },
>(entries: ENTRIES): ENTRIES {
  for (const [moduleId, brickModule] of Object.entries(entries)) {
    if (brickModule.id !== moduleId) {
      throw new Error(
        `makeBackendLibrary: module id ${JSON.stringify(brickModule.id)} does not match key ${JSON.stringify(moduleId)}`,
      );
    }
  }
  return entries;
}
