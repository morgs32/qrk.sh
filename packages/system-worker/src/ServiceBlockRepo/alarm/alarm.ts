import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { drainAccountSubscribers } from '../drainAccountSubscribers/drainAccountSubscribers.js';
import { drainServiceFrontendSubscribers } from '../drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';

export const alarm = Effect.fn('ServiceBlockRepo.alarm')(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, key, storage } = props;

  // This lifecycle invocation shares one alarm across both subscriber queues.
  // Claiming a sequence before either drain prevents an older overlapping
  // success from deleting the retry alarm chosen by a newer invocation.
  const drainSequence = yield* Effect.promise(() =>
    storage.transaction(async transaction => {
      const previousDrainSequence =
        (await transaction.get<number>(
          'serviceBlockSubscriberDrainSequence',
        )) ?? 0;
      const nextDrainSequence = previousDrainSequence + 1;
      await transaction.put(
        'serviceBlockSubscriberDrainSequence',
        nextDrainSequence,
      );
      return nextDrainSequence;
    }),
  );

  const accountNextRetryAt = yield* drainAccountSubscribers({
    db,
    serviceName: key.serviceName,
  });
  const serviceFrontendNextRetryAt = yield* drainServiceFrontendSubscribers({
    db,
    key,
    onlyServiceFrontendRepoName: null,
    failFast: false,
  });
  const nextRetryAt =
    accountNextRetryAt === null
      ? serviceFrontendNextRetryAt
      : serviceFrontendNextRetryAt === null
        ? accountNextRetryAt
        : Math.min(accountNextRetryAt, serviceFrontendNextRetryAt);

  yield* Effect.promise(() =>
    storage.transaction(async transaction => {
      const currentDrainSequence = await transaction.get<number>(
        'serviceBlockSubscriberDrainSequence',
      );
      const currentAlarm = await transaction.getAlarm();
      if (nextRetryAt === null) {
        if (currentDrainSequence === drainSequence) {
          await transaction.deleteAlarm();
        }
        return;
      }
      if (
        currentAlarm === null ||
        currentAlarm <= Date.now() ||
        nextRetryAt < currentAlarm
      ) {
        await transaction.setAlarm(nextRetryAt);
      }
    }),
  );
});
