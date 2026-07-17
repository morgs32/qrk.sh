import { Brand } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IAnyTables, IModels } from '../models/types.ts';

import { makeDrizzleRelationsFromTables } from './makeDrizzleRelations.ts';
import { makeDrizzleSchemasRecordFromTables } from './makeDrizzleSchemas.ts';
import type {
  IDbConfig,
  IResourceDbConfig,
} from './types.ts';

export function makeDbConfig<TABLES extends IAnyTables>(props: {
  tables: TABLES;
}): IDbConfig<
  ReturnType<typeof makeDrizzleSchemasRecordFromTables<TABLES>>,
  ReturnType<typeof makeDrizzleRelationsFromTables<TABLES>>
> {
  const { tables } = props;
  return {
    schema: makeDrizzleSchemasRecordFromTables(tables),
    relations: makeDrizzleRelationsFromTables(tables),
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
  const modelTables = mapValues(props.models, model => model.table);

  if (props.otherTables === undefined) {
    return Brand.nominal<IResourceDbConfig<MODELS, Record<never, never>>>()(
      makeDbConfig({ tables: modelTables }),
    );
  }

  return Brand.nominal<IResourceDbConfig<MODELS, OTHER_TABLES>>()(
    makeDbConfig({
      tables: {
        ...modelTables,
        ...props.otherTables,
      },
    }),
  );
}
