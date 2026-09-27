import { makeCommand } from '@zerospin/core/makeCommand';
import { makeAggregateId } from '@zerospin/core/utils/make/makeAggregateId';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { Effect } from 'effect';

import { system } from './zerospin.config.ts';

export const seeds = Effect.runSync(
  Effect.gen(function* () {
    const aggregateId = makeAggregateId({ id: 'seed-user' });
    return [
      yield* makeCommand(system.aggregates.user['2.0.0'], {
        contractName: 'createUser',
        actorName: 'default',
        claims: { userId: 'seed-user', aggregateId },
        systemName: system.name,
        aggregateId,
        payload: { name: 'Ada' },
      }),

      yield* makeCommand(system.services.app['2.0.0'], {
        contractName: 'createProduct',
        payload: { name: 'Notebook' },
      }),
    ];
  }).pipe(Effect.provide(NanoIdFactory)),
);
