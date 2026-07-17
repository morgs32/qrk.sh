import { ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import type { IModel } from '../models/types.ts';

import type { IOperationName } from './types.ts';

export const getResourceRow = Effect.fn('getResourceRow')(function* <
  CONFIG extends IDbConfig,
>(props: {
  tx: ITx<CONFIG>;
  model: IModel;
  operationName: Exclude<IOperationName, 'create'>;
  resourceId: string;
}): Effect.fn.Return<
  Record<string, unknown> & { readonly updatedAt: Date },
  IAnyError
> {
  const { model, operationName, resourceId, tx } = props;
  const table = model.drizzleSchema;

  const row = tx.select().from(table).where(eq(table.id, resourceId)).get();
  if (row === undefined) {
    return yield* new ZerospinError({
      code: 'mutation-row-not-found',
      message: `Cannot apply ${operationName} mutation on missing row "${resourceId}"`,
      extra: { modelName: model.modelName, resourceId },
    });
  }
  if (!(row.updatedAt instanceof Date)) {
    return yield* new ZerospinError({
      code: 'mutation-row-invalid-updated-at',
      message: `Cannot apply ${operationName} mutation on row "${resourceId}" without updatedAt`,
      extra: { modelName: model.modelName, resourceId },
    });
  }

  return {
    ...row,
    updatedAt: row.updatedAt,
  };
});
