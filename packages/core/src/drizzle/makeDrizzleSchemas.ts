import { mapValues } from 'es-toolkit';

import { makeDrizzleSchemaFromTable } from '../models/primitiveMaps.ts';
import type { IAnyTables, IModels } from '../models/types.ts';

import type {
  InferDrizzleSchemaFromTables,
  IResourceDrizzleSchemasFromModels,
} from './types.ts';

export function makeDrizzleSchemasRecordFromTables<TABLES extends IAnyTables>(
  tables: TABLES,
): InferDrizzleSchemaFromTables<TABLES> {
  return mapValues(tables, table =>
    makeDrizzleSchemaFromTable(table),
  ) as InferDrizzleSchemaFromTables<TABLES>;
}

export function makeResourceDrizzleSchemas<MODELS extends IModels>(
  models: MODELS,
): IResourceDrizzleSchemasFromModels<MODELS> {
  return mapValues(models, model =>
    makeDrizzleSchemaFromTable(model.table),
  ) as IResourceDrizzleSchemasFromModels<MODELS>;
}
