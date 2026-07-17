import { getTableColumns, sql } from 'drizzle-orm';
import type {
  BaseSQLiteDatabase,
  SQLiteUpdateSetSource,
} from 'drizzle-orm/sqlite-core';
import { mapValues } from 'es-toolkit';

import type {
  IAnyPrimitiveDescriptor,
  IAnyShape,
  IAnyTables,
  IDrizzleSchema,
  IModels,
} from '../models/types.ts';

import type {
  IDbConfigRelations,
  IDbConfigSchema,
  IResourceDbConfig,
} from './types.ts';

type IUpsertShape = IAnyShape & {
  id: IAnyPrimitiveDescriptor;
};

type IUpsertTx<MODELS extends IModels, OTHER_TABLES extends IAnyTables> = Pick<
  BaseSQLiteDatabase<
    'sync' | 'async',
    unknown,
    IDbConfigSchema<IResourceDbConfig<MODELS, OTHER_TABLES>>,
    IDbConfigRelations<IResourceDbConfig<MODELS, OTHER_TABLES>>
  >,
  'insert'
>;

export function upsertHelper<
  MODELS extends IModels,
  OTHER_TABLES extends IAnyTables,
  TABLE_NAME extends string,
  PROPERTIES extends IUpsertShape,
>(props: {
  table: IDrizzleSchema<TABLE_NAME, PROPERTIES>;
  tx: IUpsertTx<MODELS, OTHER_TABLES>;
  values: IDrizzleSchema<TABLE_NAME, PROPERTIES>['$inferInsert'];
}) {
  const { table, tx, values } = props;
  const { id: _id, ...updateColumns } = getTableColumns(table);
  const set = mapValues(updateColumns, (_column, key) =>
    sql.raw(`excluded.${String(key)}`),
  ) as unknown as SQLiteUpdateSetSource<IDrizzleSchema<TABLE_NAME, PROPERTIES>>;

  return tx
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: table.id,
      set,
    })
    .run();
}
