import { makeCommand } from '@zerospin/core/makeCommand';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { Effect } from 'effect';

import { system } from './zerospin.config';

export const seeds = Effect.runSync(
  Effect.gen(function* () {
    return [
      yield* makeCommand(system.aggregates.user['2.0.0'], {
        contractName: 'createUser',
        systemName: system.name,
        aggregateId: makeAggregateId({ id: 'seed-user' }),
        payload: { name: 'Ada' },
      }),

      yield* makeCommand(system.services.app['2.0.0'], {
        contractName: 'createProduct',
        payload: { name: 'Notebook' },
      }),
    ];
  }).pipe(Effect.provide(NanoIdFactory)),
);
