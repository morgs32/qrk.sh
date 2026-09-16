import type { Catalog } from "@json-render/core";

import type { IModule } from "../types";

/** Attach backend catalogs onto frontend modules. Every backend key must be present. */
export function makeFrontendLibrary<
  BACKEND extends {
    readonly [moduleId: string]: {
      readonly catalog: Catalog;
    };
  },
>(
  backend: BACKEND,
  modules: { [K in keyof BACKEND]: IModule } & { [moduleId: string]: IModule },
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
    if (moduleId === "github-profile") {
      result[moduleId] = {
        ...brickModule,
        catalog: backend["github-profile"].catalog,
      };
      continue;
    }
    result[moduleId] = {
      ...brickModule,
      catalog: undefined,
    };
  }
  return result;
}
