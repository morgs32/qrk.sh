import {
  makeDrizzleSchemaFromTable,
  type IAnyDrizzleSchemas,
  type IAnyTable,
  type IAnyTables,
} from '@zerospin/schema';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import type { InferDrizzleSchemaFromTables } from './types.ts';

export function makeDrizzleSchemasRecordFromTables<TABLES extends IAnyTables>(
  tables: TABLES,
  physicalTableNames: Partial<Record<keyof TABLES & string, string>> = {},
  tableAliases: ReadonlyMap<unknown, IAnyTable> = new Map(),
): InferDrizzleSchemaFromTables<TABLES> {
  const tableKeysByIdentity = new Map<IAnyTable, string>();
  const drizzleSchemas: IAnyDrizzleSchemas = {};
  const registeredPhysicalTableNames = new Map<string, string>();

  for (const [tableKey, table] of Object.entries(tables)) {
    const physicalTableName = physicalTableNames[tableKey] ?? table.name;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(physicalTableName)) {
      throw new Error(
        `makeDrizzleSchemasRecordFromTables: invalid physical table name "${physicalTableName}" at key "${tableKey}"`,
      );
    }
    const priorTableKey = registeredPhysicalTableNames.get(physicalTableName);
    if (priorTableKey !== undefined) {
      throw new Error(
        `makeDrizzleSchemasRecordFromTables: duplicate physical table name "${physicalTableName}" at keys "${priorTableKey}" and "${tableKey}"`,
      );
    }
    registeredPhysicalTableNames.set(physicalTableName, tableKey);
    tableKeysByIdentity.set(table, tableKey);
    drizzleSchemas[tableKey] = makeDrizzleSchemaFromTable(
      physicalTableName === table.name
        ? table
        : {
            ...table,
            name: physicalTableName,
            indexes: table.indexes.map(indexConfig => ({
              ...indexConfig,
              name: `${physicalTableName}_${indexConfig.name}`,
            })),
          },
      descriptor => () => {
        const targetTableKey = tableKeysByIdentity.get(
          tableAliases.get(descriptor.table) ?? descriptor.table,
        );
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
