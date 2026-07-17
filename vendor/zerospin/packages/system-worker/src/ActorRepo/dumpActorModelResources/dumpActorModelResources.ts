/*
 * System-worker annotation:
 * Implements the ActorRepo dump Actor Model Resources operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { getActorController } from '@zerospin/core/accountController/getActorController';
import type { IDb } from '@zerospin/core/drizzle/types';
import { selectAllFromSelection } from '@zerospin/core/models/makeSelection';
import type {
  IActorId,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const dumpActorModelResources = Effect.fn(
  'ActorRepo.dumpActorModelResources',
)(function* (props: {
  accountName: string;
  actorName: string;
  actorId: IActorId;
  modelName: string;
  db: IDb;
}): Effect.fn.Return<Array<IEncodedResourceShape>, IAnyError> {
  const { accountName, actorId, actorName, db, modelName } = props;

  const actorController = yield* getActorController({
    system,
    accountName,
    actorName,
  });
  const selection = yield* getByKeyOrThrow({
    record: actorController.selections,
    key: modelName,
    recordKind: 'actor selections',
  });

  const rows = selectAllFromSelection({
    db: db as never,
    models: actorController.models,
    selection,
    actorId,
  }).all();
  return rows as IEncodedResourceShape[];
});
