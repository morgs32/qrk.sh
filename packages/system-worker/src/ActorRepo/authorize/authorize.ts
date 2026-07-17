/*
 * System-worker annotation:
 * Implements the ActorRepo authorize operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { getActorController } from '@zerospin/core/accountController/getActorController';
import type { IActor } from '@zerospin/core/actorController/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';
import { system } from 'system';

export const authorize = Effect.fn('ActorRepo.authorize')(function* (props: {
  actor: IActor;
  accountName: string;
  actorName: string;
  db: IDb;
}) {
  const { actor, db } = props;

  const actorController = yield* getActorController({
    system,
    accountName: props.accountName,
    actorName: props.actorName,
  });

  yield* actorController.authorize({
    actorId: actor.actorId,
    db,
  });
});
