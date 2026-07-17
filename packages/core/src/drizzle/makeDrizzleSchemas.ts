import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { mapValues } from 'es-toolkit';

import { makeDrizzleSchemaFromTable } from '../models/primitiveMaps.ts';
import type {
  IAnyDrizzleSchemas,
  IAnyTable,
  IAnyTables,
  IModels,
} from '../models/types.ts';

import type {
  InferDrizzleSchemaFromTables,
  IResourceDrizzleSchemasFromModels,
} from './types.ts';

export function makeDrizzleSchemasRecordFromTables<TABLES extends IAnyTables>(
  tables: TABLES,
): InferDrizzleSchemaFromTables<TABLES> {
  const tableKeysByIdentity = new Map<IAnyTable, string>();
  const drizzleSchemas: IAnyDrizzleSchemas = {};

  for (const [tableKey, table] of Object.entries(tables)) {
    tableKeysByIdentity.set(table, tableKey);
    drizzleSchemas[tableKey] = makeDrizzleSchemaFromTable(
      table,
      descriptor => () => {
        const targetTableKey = tableKeysByIdentity.get(descriptor.table);
        if (targetTableKey === undefined) {
          throw new Error(
            `Reference ${table.name}.${descriptor.relation} targets unregistered table ${descriptor.targetTableName}`,
          );
        }
        const targetSchema = drizzleSchemas[targetTableKey];
        if (targetSchema === undefined) {
          throw new Error(
            `Reference ${table.name}.${descriptor.relation} resolved before target table ${descriptor.targetTableName} was registered`,
          );
        }
        const targetColumn = getTableConfig(targetSchema).columns.find(
          column => column.name === descriptor.targetColumnName,
        );
        if (targetColumn === undefined) {
          throw new Error(
            `Reference ${table.name}.${descriptor.relation} targets missing column ${descriptor.targetTableName}.${descriptor.targetColumnName}`,
          );
        }
        return targetColumn;
      },
    );
  }

  return drizzleSchemas as InferDrizzleSchemaFromTables<TABLES>;
}

export function makeResourceDrizzleSchemas<MODELS extends IModels>(
  models: MODELS,
): IResourceDrizzleSchemasFromModels<MODELS> {
  return makeDrizzleSchemasRecordFromTables(
    mapValues(models, model => model.table),
  ) as IResourceDrizzleSchemasFromModels<MODELS>;
}
