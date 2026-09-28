import { type IAnyTable } from '@zerospin/schema';
import { mapValues } from 'es-toolkit';

import { Model } from '../../models/defineModel.ts';
import type { IAnyModels } from '../../models/types.ts';
import type { IDbConfig, IDrizzleRelationsFromModels, InferDrizzleSchemaFromTables, IWaSqliteClient, IWaSqliteDrizzleDb } from '../types.ts';
import { makeDrizzleRelationsFromTables } from './makeDbConfig/makeDrizzleRelationsFromTables/makeDrizzleRelationsFromTables.ts';
import { makeDrizzleSchemasRecordFromTables } from './makeDrizzleSchemasRecordFromTables.ts';
import { makeWaSqliteDrizzle } from './makeProvisionedInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb/makeWaSqliteDrizzle/makeWaSqliteDrizzle.ts';

/** Model-only decoded queries over the session's existing connection and notifications. */
export function makeSessionQueryDb<MODELS extends IAnyModels>(props: {
  models: MODELS;
  client: IWaSqliteClient;
}): Pick<
  IWaSqliteDrizzleDb<IDbConfig<
    InferDrizzleSchemaFromTables<{ [K in keyof MODELS]: MODELS[K]['table'] }, true>,
    IDrizzleRelationsFromModels<MODELS, { [K in keyof MODELS]: MODELS[K]['table'] }, true>
  >>,
  'query' | '$client'
> {
  const tables: { [K in keyof MODELS]: MODELS[K]['table'] } = mapValues(
    props.models,
    model => model.table,
  );
  const aliases = new Map<unknown, IAnyTable>();
  for (const model of Object.values(props.models)) {
    if (Model.isReplica(model)) aliases.set(model.sourceModel.table, model.table);
  }
  const db = makeWaSqliteDrizzle(props.client, {
    tables,
    schema: makeDrizzleSchemasRecordFromTables(tables, {}, aliases, true),
    relations: makeDrizzleRelationsFromTables(tables, {}, aliases, true),
  });
  return { query: db.query, $client: db.$client };
}
