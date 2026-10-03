import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateActorOutput } from '@zerospin/core/aggregateSession/types';
import { Effect } from 'effect';

/** Explicitly construct the browser command and its occurrence checkpoint. */
export const deliverActorOutput = Effect.fn('deliverActorOutput')(
  function* (props: {
    aggregateName: string;
    aggregateVersion: string;
    aggregateSessionLock: IAggregateSessionLock;
    output: IAggregateActorOutput;
  }) {
    const { output, aggregateSessionLock: lock } = props;
    return {
      executedIndex: output.executedIndex,
      aggregateIndex: output.aggregateIndex,
      executedHash: output.executedHash,
      command: {
        id: output.command.id,
        commandName: output.command.commandName,
        failure: output.command.failure,
        delta: {
          upserted: output.command.delta.upserted.filter(resource =>
            Object.hasOwn(lock.models, resource.modelName),
          ),
          deleted: output.command.delta.deleted.filter(resource =>
            Object.hasOwn(lock.models, resource.modelName),
          ),
        },
      },
    };
  },
);
