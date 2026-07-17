import {
  defineRelations,
  type AnyRelation,
  type AnyRelations,
  type RelationsBuilder,
  type RelationsBuilderColumnBase,
} from 'drizzle-orm';

import { PrimitiveKind } from '../models/primitiveKind.ts';
import type {
  IAnyTable,
  IAnyTables,
  IModels,
} from '../models/types.ts';

import { makeDrizzleSchemasRecordFromTables } from './makeDrizzleSchemas.ts';
import type { IDrizzleRelationsFromModels } from './types.ts';

/** Derives and validates all Drizzle relations from one concrete table graph. */
export function makeDrizzleRelationsFromTables<TABLES extends IAnyTables>(
  tables: TABLES,
): IDrizzleRelationsFromModels<IModels, TABLES>;
export function makeDrizzleRelationsFromTables<TABLES extends IAnyTables>(
  tables: TABLES,
): AnyRelations {
  const tableKeys: (keyof TABLES & string)[] = [];
  const tableKeyByObject = new Map<IAnyTable, keyof TABLES & string>();
  const tableKeyByName = new Map<string, keyof TABLES & string>();
  const primaryKeyColumnByTableKey = new Map<
    keyof TABLES & string,
    string
  >();
  const relationNamesByTableKey = new Map<
    keyof TABLES & string,
    Set<string>
  >();
  const targetsBySourceTableKey = new Map<
    keyof TABLES & string,
    Set<keyof TABLES & string>
  >();

  for (const tableKey in tables) {
    if (Object.hasOwn(tables, tableKey)) {
      tableKeys.push(tableKey);
    }
  }

  // Step 1: register every table object and physical table name. Relation
  // targets are resolved by concrete object identity, while duplicate physical
  // names are rejected independently of the record keys.
  for (const tableKey of tableKeys) {
    const table = tables[tableKey];
    if (table === undefined) {
      continue;
    }
    const priorTableKey = tableKeyByName.get(table.name);
    if (priorTableKey !== undefined) {
      throw new Error(
        `makeDrizzleRelationsFromTables: duplicate table name "${table.name}" at keys "${priorTableKey}" and "${tableKey}"`,
      );
    }
    tableKeyByObject.set(table, tableKey);
    tableKeyByName.set(table.name, tableKey);
    relationNamesByTableKey.set(tableKey, new Set());
    targetsBySourceTableKey.set(tableKey, new Set());
  }

  // Step 2: inspect every column on every table. Zero primary keys are valid
  // until another table references that table; multiple primary keys are never
  // a valid table shape for this database configuration.
  for (const tableKey of tableKeys) {
    const table = tables[tableKey];
    if (table === undefined) {
      continue;
    }
    let primaryKeyColumnName: string | undefined;
    for (const [columnName, descriptor] of Object.entries(table.shape)) {
      if (descriptor.kind !== PrimitiveKind.PrimaryKey) {
        continue;
      }
      if (primaryKeyColumnName !== undefined) {
        throw new Error(
          `makeDrizzleRelationsFromTables: table "${table.name}" has multiple primary keys`,
        );
      }
      primaryKeyColumnName = columnName;
    }
    if (primaryKeyColumnName !== undefined) {
      primaryKeyColumnByTableKey.set(tableKey, primaryKeyColumnName);
    }
  }

  // Step 3: validate each forward ref and reserve both its forward and inverse
  // relation names on their respective source/target tables.
  for (const sourceTableKey of tableKeys) {
    const sourceTable = tables[sourceTableKey];
    if (sourceTable === undefined) {
      continue;
    }
    for (const [sourceColumnName, descriptor] of Object.entries(
      sourceTable.shape,
    )) {
      if (descriptor.kind !== PrimitiveKind.Ref) {
        continue;
      }

      const targetTableKey = tableKeyByObject.get(descriptor.table);
      if (targetTableKey === undefined) {
        throw new Error(
          `makeDrizzleRelationsFromTables: ref "${sourceTable.name}.${sourceColumnName}" targets table "${descriptor.targetTableName}" outside this database`,
        );
      }
      const targetTable = tables[targetTableKey];
      if (targetTable === undefined) {
        throw new Error(
          `makeDrizzleRelationsFromTables: ref "${sourceTable.name}.${sourceColumnName}" has a missing target table`,
        );
      }
      const targetPrimaryKeyColumnName =
        primaryKeyColumnByTableKey.get(targetTableKey);
      if (targetPrimaryKeyColumnName === undefined) {
        throw new Error(
          `makeDrizzleRelationsFromTables: ref "${sourceTable.name}.${sourceColumnName}" target table "${targetTable.name}" must have one primary key`,
        );
      }
      const targetPrimaryKeyDescriptor =
        targetTable.shape[targetPrimaryKeyColumnName];
      if (
        targetPrimaryKeyDescriptor?.kind !== PrimitiveKind.PrimaryKey ||
        descriptor.targetTableName !== targetTable.name ||
        descriptor.targetColumnName !== targetPrimaryKeyColumnName ||
        descriptor.abbreviation !== targetPrimaryKeyDescriptor.abbreviation
      ) {
        throw new Error(
          `makeDrizzleRelationsFromTables: ref "${sourceTable.name}.${sourceColumnName}" has invalid target key metadata`,
        );
      }

      const sourceRelationNames = relationNamesByTableKey.get(sourceTableKey);
      const targetRelationNames = relationNamesByTableKey.get(targetTableKey);
      if (sourceRelationNames === undefined || targetRelationNames === undefined) {
        throw new Error(
          `makeDrizzleRelationsFromTables: relation registry is missing for "${sourceTable.name}.${sourceColumnName}"`,
        );
      }
      if (sourceRelationNames.has(descriptor.relation)) {
        throw new Error(
          `makeDrizzleRelationsFromTables: duplicate relation name "${sourceTable.name}.${descriptor.relation}"`,
        );
      }
      sourceRelationNames.add(descriptor.relation);
      if (targetRelationNames.has(descriptor.inverse)) {
        throw new Error(
          `makeDrizzleRelationsFromTables: duplicate relation name "${targetTable.name}.${descriptor.inverse}"`,
        );
      }
      targetRelationNames.add(descriptor.inverse);

      const targets = targetsBySourceTableKey.get(sourceTableKey);
      if (targets === undefined) {
        throw new Error(
          `makeDrizzleRelationsFromTables: target registry is missing for table "${sourceTable.name}"`,
        );
      }
      // A self ref is resolved within one table and is valid Drizzle relation
      // metadata. Only cross-table edges participate in cycle detection.
      if (targetTableKey !== sourceTableKey) {
        targets.add(targetTableKey);
      }
    }
  }

  // Step 4: perform an explicit depth-first traversal over the validated ref
  // edges. A table re-entered while still visiting proves a cycle.
  const visitingTableKeys = new Set<keyof TABLES & string>();
  const visitedTableKeys = new Set<keyof TABLES & string>();
  for (const tableKey of tableKeys) {
    if (visitedTableKeys.has(tableKey)) {
      continue;
    }

    const traversalStack: Array<{
      tableKey: keyof TABLES & string;
      expanded: boolean;
    }> = [{ tableKey, expanded: false }];

    while (traversalStack.length > 0) {
      const current = traversalStack.pop();
      if (current === undefined) {
        continue;
      }
      if (current.expanded) {
        visitingTableKeys.delete(current.tableKey);
        visitedTableKeys.add(current.tableKey);
        continue;
      }
      if (visitedTableKeys.has(current.tableKey)) {
        continue;
      }
      if (visitingTableKeys.has(current.tableKey)) {
        const table = tables[current.tableKey];
        throw new Error(
          `makeDrizzleRelationsFromTables: cyclic ref graph at table "${table?.name ?? current.tableKey}"`,
        );
      }

      visitingTableKeys.add(current.tableKey);
      traversalStack.push({ tableKey: current.tableKey, expanded: true });

      const targetTableKeys = targetsBySourceTableKey.get(current.tableKey);
      if (targetTableKeys === undefined) {
        continue;
      }
      for (const targetTableKey of targetTableKeys) {
        traversalStack.push({ tableKey: targetTableKey, expanded: false });
      }
    }
  }

  const schema = makeDrizzleSchemasRecordFromTables(tables);

  // Step 5: construct one forward relation and one inverse relation for every
  // ref. Unique refs produce inverse one relations; all other refs produce
  // inverse many relations.
  return defineRelations(schema, (builder: RelationsBuilder<typeof schema>) => {
    const result: Record<string, Record<string, AnyRelation>> = {};
    for (const tableKey of tableKeys) {
      result[tableKey] = {};
    }

    for (const sourceTableKey of tableKeys) {
      const sourceTable = tables[sourceTableKey];
      if (sourceTable === undefined) {
        continue;
      }
      for (const [sourceColumnName, descriptor] of Object.entries(
        sourceTable.shape,
      )) {
        if (descriptor.kind !== PrimitiveKind.Ref) {
          continue;
        }
        const targetTableKey = tableKeyByObject.get(descriptor.table);
        if (targetTableKey === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing target table while building "${sourceTable.name}.${descriptor.relation}"`,
          );
        }
        const targetPrimaryKeyColumnName =
          primaryKeyColumnByTableKey.get(targetTableKey);
        if (targetPrimaryKeyColumnName === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing target primary key while building "${sourceTable.name}.${descriptor.relation}"`,
          );
        }

        const forwardRelationPath = `${sourceTableKey}.${descriptor.relation}`;
        const sourceColumns = builder[sourceTableKey] as never as
          | Record<string, RelationsBuilderColumnBase | undefined>
          | undefined;
        if (sourceColumns === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing schema table "${sourceTableKey}" while building "${forwardRelationPath}"`,
          );
        }
        const targetColumns = builder[targetTableKey] as never as
          | Record<string, RelationsBuilderColumnBase | undefined>
          | undefined;
        if (targetColumns === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing schema table "${targetTableKey}" while building "${forwardRelationPath}"`,
          );
        }
        const sourceColumn = sourceColumns[sourceColumnName];
        if (sourceColumn === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing column "${sourceColumnName}" on "${sourceTableKey}" while building "${forwardRelationPath}"`,
          );
        }
        const targetPrimaryKeyColumn =
          targetColumns[targetPrimaryKeyColumnName];
        if (targetPrimaryKeyColumn === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing column "${targetPrimaryKeyColumnName}" on "${targetTableKey}" while building "${forwardRelationPath}"`,
          );
        }

        const forwardOne = builder.one[targetTableKey] as
          | ((config: {
              from?:
                | RelationsBuilderColumnBase
                | readonly [
                    RelationsBuilderColumnBase,
                    ...RelationsBuilderColumnBase[],
                  ];
              to?:
                | RelationsBuilderColumnBase
                | readonly [
                    RelationsBuilderColumnBase,
                    ...RelationsBuilderColumnBase[],
                  ];
              optional?: boolean;
            }) => AnyRelation)
          | undefined;
        if (forwardOne === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing one() helper for target "${targetTableKey}" while building "${forwardRelationPath}"`,
          );
        }
        const sourceRelations = result[sourceTableKey];
        if (sourceRelations === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing relation result for table "${sourceTableKey}"`,
          );
        }
        sourceRelations[descriptor.relation] = forwardOne({
          from: sourceColumn,
          to: targetPrimaryKeyColumn,
          optional: descriptor.nullable,
        });

        const inverseRelationPath = `${targetTableKey}.${descriptor.inverse}`;
        const inverseRelationFactory =
          descriptor.unique === true
            ? (builder.one[sourceTableKey] as
                | ((config: {
                    from?:
                      | RelationsBuilderColumnBase
                      | readonly [
                          RelationsBuilderColumnBase,
                          ...RelationsBuilderColumnBase[],
                        ];
                    to?:
                      | RelationsBuilderColumnBase
                      | readonly [
                          RelationsBuilderColumnBase,
                          ...RelationsBuilderColumnBase[],
                        ];
                    optional?: boolean;
                  }) => AnyRelation)
                | undefined)
            : (builder.many[sourceTableKey] as
                | ((config: {
                    from?:
                      | RelationsBuilderColumnBase
                      | readonly [
                          RelationsBuilderColumnBase,
                          ...RelationsBuilderColumnBase[],
                        ];
                    to?:
                      | RelationsBuilderColumnBase
                      | readonly [
                          RelationsBuilderColumnBase,
                          ...RelationsBuilderColumnBase[],
                        ];
                    optional?: boolean;
                  }) => AnyRelation)
                | undefined);
        if (inverseRelationFactory === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing ${descriptor.unique === true ? 'one' : 'many'}() helper for target "${sourceTableKey}" while building "${inverseRelationPath}"`,
          );
        }
        const targetRelations = result[targetTableKey];
        if (targetRelations === undefined) {
          throw new Error(
            `makeDrizzleRelationsFromTables: missing relation result for table "${targetTableKey}"`,
          );
        }
        targetRelations[descriptor.inverse] =
          descriptor.unique === true
            ? inverseRelationFactory({
                from: targetPrimaryKeyColumn,
                to: sourceColumn,
                optional: true,
              })
            : inverseRelationFactory({
                from: targetPrimaryKeyColumn,
                to: sourceColumn,
              });
      }
    }

    return result;
  });
}
