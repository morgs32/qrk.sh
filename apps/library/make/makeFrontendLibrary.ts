import type { Catalog, Spec } from "@json-render/core";

import type { IModule } from "../lib/types";

/** Attach backend catalogs and defaultSpecs onto frontend modules. Every backend key must be present. */
export function makeFrontendLibrary<
  BACKEND extends {
    readonly [moduleId: string]: {
      readonly catalog: Catalog;
      readonly defaultSpec: Spec;
    };
  },
>(
  backend: BACKEND,
  modules: { [K in keyof BACKEND]: Omit<IModule, "catalog"> } & {
    [moduleId: string]: Omit<IModule, "catalog">;
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
    const backendEntry = backend[moduleId as keyof BACKEND];
    if (backendEntry === undefined) {
      throw new Error(
        `makeFrontendLibrary: missing backend entry for module ${JSON.stringify(moduleId)}`,
      );
    }
    if (brickModule.dataShape === null) {
      result[moduleId] = {
        ...brickModule,
        catalog: backendEntry.catalog,
        defaultSpec: backendEntry.defaultSpec,
        dataShape: null,
        defaultData: null,
        configuration: undefined,
      };
    } else {
      result[moduleId] = {
        ...brickModule,
        catalog: backendEntry.catalog,
        defaultSpec: backendEntry.defaultSpec,
        dataShape: brickModule.dataShape,
        defaultData: brickModule.defaultData,
      };
    }
  }
  return result;
}
