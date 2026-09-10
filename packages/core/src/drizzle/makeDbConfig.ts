import type { IAnyTable, IAnyTables } from '@zerospin/schema';
import { Brand } from 'effect';
import { mapValues } from 'es-toolkit';

import { Model } from '../models/makeModel.ts';
import type { IAnyModels } from '../models/types.ts';

import { makeDrizzleRelationsFromTables } from './makeDrizzleRelations.ts';
import { makeDrizzleSchemasRecordFromTables } from './makeDrizzleSchemas.ts';
import type { IDbConfig, IResourceDbConfig } from './types.ts';

export function makeDbConfig<TABLES extends IAnyTables>(props: {
  tables: TABLES;
  physicalTableNames?: Partial<Record<keyof TABLES & string, string>>;
  tableAliases?: ReadonlyMap<unknown, IAnyTable>;
}): IDbConfig<
  ReturnType<typeof makeDrizzleSchemasRecordFromTables<TABLES>>,
  ReturnType<typeof makeDrizzleRelationsFromTables<TABLES>>
> {  const { physicalTableNames, tableAliases, tables } = props;
return {
    schema: makeDrizzleSchemasRecordFromTables(
      tables,
      physicalTableNames,
      tableAliases,
    ),
    relations: makeDrizzleRelationsFromTables(
      tables,
      physicalTableNames,
      tableAliases,
    ),
  };
}

export function makeResourceDbConfig<MODELS extends IAnyModels>(props: {
  models: MODELS;
  otherTables?: undefined;
}): IResourceDbConfig<MODELS, Record<never, never>>;

export function makeResourceDbConfig<
  MODELS extends IAnyModels,
  OTHER_TABLES extends IAnyTables,
>(props: {
  models: MODELS;
  otherTables: OTHER_TABLES;
}): IResourceDbConfig<MODELS, OTHER_TABLES>;

export function makeResourceDbConfig<
  MODELS extends IAnyModels,
  OTHER_TABLES extends IAnyTables,
>(props: { models: MODELS; otherTables?: OTHER_TABLES }) {  const { models, otherTables } = props;
const modelTables: {
    [K in keyof MODELS]: MODELS[K]['table'];
  } = mapValues(models, model => model.table);
  const tableAliases = new Map<unknown, IAnyTable>();
  for (const model of Object.values(models)) {
    if (Model.isReplica(model)) {
      tableAliases.set(model.sourceModel.table, model.table);
    }
  }

  if (otherTables === undefined) {
    return Brand.nominal<IResourceDbConfig<MODELS, Record<never, never>>>()(
      makeDbConfig({ tables: modelTables, tableAliases }),
    );
  }

  const tables = {
    ...modelTables,
    ...otherTables,
  };

  return Brand.nominal<IResourceDbConfig<MODELS, OTHER_TABLES>>()({
    schema: makeDrizzleSchemasRecordFromTables(tables, {}, tableAliases),
    relations: makeDrizzleRelationsFromTables(tables, {}, tableAliases),
  });
}
