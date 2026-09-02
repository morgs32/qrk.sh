import type { IAnyTable, IAnyTables } from '@zerospin/schema';
import { Brand } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IModels } from '../models/types.ts';

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
> {
  const { tables } = props;
  return {
    schema: makeDrizzleSchemasRecordFromTables(
      tables,
      props.physicalTableNames,
      props.tableAliases,
    ),
    relations: makeDrizzleRelationsFromTables(
      tables,
      props.physicalTableNames,
      props.tableAliases,
    ),
  };
}

export function makeResourceDbConfig<MODELS extends IModels>(props: {
  models: MODELS;
  otherTables?: undefined;
}): IResourceDbConfig<MODELS, Record<never, never>>;

export function makeResourceDbConfig<
  MODELS extends IModels,
  OTHER_TABLES extends IAnyTables,
>(props: {
  models: MODELS;
  otherTables: OTHER_TABLES;
}): IResourceDbConfig<MODELS, OTHER_TABLES>;

export function makeResourceDbConfig<
  MODELS extends IModels,
  OTHER_TABLES extends IAnyTables,
>(props: { models: MODELS; otherTables?: OTHER_TABLES }) {
  const modelTables: {
    [K in keyof MODELS]: MODELS[K]['table'];
  } = mapValues(props.models, model => model.table);
  const tableAliases = new Map<unknown, IAnyTable>();
  for (const model of Object.values(props.models)) {
    if ('sourceModel' in model) {
      const sourceModel = Reflect.get(model, 'sourceModel');
      if (typeof sourceModel !== 'object' || sourceModel === null) {
        throw new Error(
          `makeResourceDbConfig: replica model "${model.modelName}" has no source model`,
        );
      }
      const sourceTable = Reflect.get(sourceModel, 'table');
      if (sourceTable === undefined) {
        throw new Error(
          `makeResourceDbConfig: replica model "${model.modelName}" source has no table`,
        );
      }
      tableAliases.set(sourceTable, model.table);
    }
  }

  if (props.otherTables === undefined) {
    return Brand.nominal<IResourceDbConfig<MODELS, Record<never, never>>>()(
      makeDbConfig({ tables: modelTables, tableAliases }),
    );
  }

  const tables = {
    ...modelTables,
    ...props.otherTables,
  };

  return Brand.nominal<IResourceDbConfig<MODELS, OTHER_TABLES>>()({
    schema: makeDrizzleSchemasRecordFromTables(tables, {}, tableAliases),
    relations: makeDrizzleRelationsFromTables(tables, {}, tableAliases),
  });
}
