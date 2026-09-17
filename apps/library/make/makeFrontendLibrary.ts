import type { IModule } from "../lib/types";

/** Attach frontend modules onto a backend map. Every backend key must be present. */
export function makeFrontendLibrary<
  BACKEND extends {
    readonly [moduleId: string]: {
      readonly id: string;
    };
  },
>(
  backend: BACKEND,
  modules: { [K in keyof BACKEND]: IModule } & {
    [moduleId: string]: IModule;
  },
): Record<string, IModule> {
  for (const moduleId of Object.keys(backend)) {
    const brickModule = modules[moduleId];
    if (brickModule === undefined) {
      throw new Error(
        `makeFrontendLibrary: missing frontend module for backend key ${JSON.stringify(moduleId)}`,
      );
    }
    if (brickModule.id !== moduleId) {
      throw new Error(
        `makeFrontendLibrary: module id ${JSON.stringify(brickModule.id)} does not match key ${JSON.stringify(moduleId)}`,
      );
    }
  }

  const result: Record<string, IModule> = {};
  for (const [moduleId, brickModule] of Object.entries(modules)) {
    if (brickModule.id !== moduleId) {
      throw new Error(
        `makeFrontendLibrary: module id ${JSON.stringify(brickModule.id)} does not match key ${JSON.stringify(moduleId)}`,
      );
    }
    if (backend[moduleId as keyof BACKEND] === undefined) {
      throw new Error(
        `makeFrontendLibrary: missing backend entry for module ${JSON.stringify(moduleId)}`,
      );
    }
    result[moduleId] = brickModule;
  }
  return result;
}
