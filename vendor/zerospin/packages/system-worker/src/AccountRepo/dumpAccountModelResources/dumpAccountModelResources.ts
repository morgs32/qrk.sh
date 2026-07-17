/*
 * System-worker annotation:
 * Implements the AccountRepo dump Account Model Resources operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const dumpAccountModelResources = Effect.fn(
  'AccountRepo.dumpAccountModelResources',
)(function* (props: {
  accountName: string;
  modelName: string;
  db: IDb;
}): Effect.fn.Return<Array<IEncodedResourceShape>, IAnyError> {
  const { accountName, db, modelName } = props;

  const accountController = yield* getByKeyOrThrow({
    record: system.accountControllers,
    key: accountName,
    recordKind: 'accountControllers',
  });
  const model = yield* getByKeyOrThrow({
    record: accountController.models,
    key: modelName,
    recordKind: 'models',
  });

  return db
    .select()
    .from(model.drizzleSchema)
    .orderBy(model.drizzleSchema.id)
    .all();
});
