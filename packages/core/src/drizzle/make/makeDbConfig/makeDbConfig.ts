import { resolveTableReferences,type IAnyTables,type ICheckedTableReferences,type IResolvedTables } from '@zerospin/schema';
import { Brand } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IAnyModels } from '../../../models/types.ts';

import type { IDbConfig,IResourceDbConfig } from '../../types.ts';
import { makeDrizzleSchemasRecordFromTables } from '../makeDrizzleSchemasRecordFromTables.ts';
import { makeDrizzleRelationsFromTables } from './makeDrizzleRelationsFromTables/makeDrizzleRelationsFromTables.ts';

export function makeDbConfig<TABLES extends IAnyTables>(props: {
  tables: TABLES & ICheckedTableReferences<NoInfer<TABLES>>;
  physicalTableNames?: Partial<Record<keyof TABLES & string, string>>;
}): IDbConfig<
  ReturnType<typeof makeDrizzleSchemasRecordFromTables<IResolvedTables<TABLES>>>,
  ReturnType<typeof makeDrizzleRelationsFromTables<IResolvedTables<TABLES>, true>>,
  IResolvedTables<TABLES>
> {
  const { physicalTableNames } = props;
  const tables = resolveTableReferences<TABLES>(props.tables);
  return {
    tables,
    schema: makeDrizzleSchemasRecordFromTables<IResolvedTables<TABLES>>(
      tables,
      physicalTableNames,
    ),
    relations: makeDrizzleRelationsFromTables<IResolvedTables<TABLES>, true>(
      tables,
      physicalTableNames,
      true,
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
>(props: { models: MODELS; otherTables?: OTHER_TABLES }) {
  const { models, otherTables } = props;
  const modelTables: {
    [K in keyof MODELS]: MODELS[K]['table'];
  } = mapValues(models, model => model.table);
  if (otherTables === undefined) {
    return Brand.nominal<IResourceDbConfig<MODELS, Record<never, never>>>()(
      {
        tables: modelTables,
        schema: makeDrizzleSchemasRecordFromTables(modelTables, {}),
        relations: makeDrizzleRelationsFromTables(modelTables, {}, true),
      },
    );
  }

  const tables = {
    ...modelTables,
    ...otherTables,
  };

  return Brand.nominal<IResourceDbConfig<MODELS, OTHER_TABLES>>()({
    tables,
    schema: makeDrizzleSchemasRecordFromTables(tables, {}),
    relations: makeDrizzleRelationsFromTables(tables, {}, true),
  });
}
