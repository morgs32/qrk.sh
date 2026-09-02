import type {
  IAnyPrimitiveDescriptor,
  IAnyShape,
  IAnyTables,
  IDrizzleSchema,
} from '@zerospin/schema';
import { getTableColumns, sql, type InferInsertModel } from 'drizzle-orm';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core/async/db';
import { mapValues } from 'es-toolkit';

import type { IModels } from '../models/types.ts';

import type {
  IDbConfigRelations,
  IResourceDbConfig,
} from './types.ts';

type IUpsertShape = IAnyShape & {
  id: IAnyPrimitiveDescriptor;
};

type IUpsertTx<MODELS extends IModels, OTHER_TABLES extends IAnyTables> = Pick<
  SQLiteAsyncDatabase<
    'sync' | 'async',
    unknown,
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
  values: InferInsertModel<IDrizzleSchema<TABLE_NAME, PROPERTIES>>;
}) {
  const { table, tx, values } = props;
  const { id: _id, ...updateColumns } = getTableColumns(table);
  const set = mapValues(updateColumns, (_column, key) =>
    sql.raw(`excluded.${String(key)}`),
  );
  const insert = tx.insert(table).values([values]);

  return insert
    .onConflictDoUpdate({
      target: [table.id],
      set: set as unknown as Parameters<
        typeof insert.onConflictDoUpdate
      >[0]['set'],
    })
    .run();
}
