import type { IModule } from "../lib/types";

/** Attach view modules onto a backend map. Every backend key must be present. */
export function makeModuleViewLibrary<
  BACKEND extends {
    readonly [moduleId: string]: {
      readonly id: string;
    };
  },
>(backend: BACKEND, modules: { [K in keyof BACKEND & string]: IModule<K> }) {
  for (const moduleId of Object.keys(backend)) {
    if (!Object.hasOwn(modules, moduleId)) {
      throw new Error(
        `makeModuleViewLibrary: missing view module for backend key ${JSON.stringify(moduleId)}`,
      );
    }
  }

  for (const [moduleId, brickModule] of Object.entries<IModule<keyof BACKEND & string>>(modules)) {
    if (
      brickModule === undefined ||
      brickModule.id !== moduleId ||
      brickModule.def.moduleId !== moduleId
    ) {
      throw new Error(
        `makeModuleViewLibrary: module identity does not match key ${JSON.stringify(moduleId)}`,
      );
    }
    if (!Object.hasOwn(backend, moduleId)) {
      throw new Error(
        `makeModuleViewLibrary: missing backend entry for module ${JSON.stringify(moduleId)}`,
      );
    }
  }
  return modules;
}
