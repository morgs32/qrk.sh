import { makeZerospinError, type IAnyError } from '@zerospin/error';
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
  const query = tx.query[model.modelName];
  if (query === undefined) {
    throw new Error(`Missing registered model query: ${model.modelName}`);
  }
  const row = query
    .findFirst({ where: { id: resourceId } } as Parameters<
      typeof query.findFirst
    >[0])
    .sync();
  if (row === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'mutation-row-not-found',
        message: `Cannot apply ${operationName} mutation on missing row "${resourceId}"`,
        extra: { modelName: model.modelName, resourceId },
      }),
    );
  }
  if (!('updatedAt' in row) || !(row.updatedAt instanceof Date)) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'mutation-row-invalid-updated-at',
        message: `Cannot apply ${operationName} mutation on row "${resourceId}" without updatedAt`,
        extra: { modelName: model.modelName, resourceId },
      }),
    );
  }

  return {
    ...row,
    updatedAt: row.updatedAt,
  };
});
