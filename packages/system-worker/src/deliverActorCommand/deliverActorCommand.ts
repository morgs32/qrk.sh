import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateActorCommand } from '@zerospin/core/aggregateSession/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

/** Deliver the original public envelope for recognition by the receiving runtime. Never replace the retained occurrence used by journals and hashes. */
export const deliverActorCommand = Effect.fn('deliverActorCommand')(
  function* (props: {
    aggregateName: string;
    aggregateVersion: string;
    aggregateSessionLock: IAggregateSessionLock;
    command: IAggregateActorCommand;
  }): Effect.fn.Return<IAggregateActorCommand, IAnyError> {
    const command = {
      id: props.command.id,
      nodeId: props.command.nodeId,
      nodeIndex: props.command.nodeIndex,
      aggregateIndex: props.command.aggregateIndex,
      executedIndex: props.command.executedIndex,
      executedHash: props.command.executedHash,
      actorDelta: {
        upserted: props.command.actorDelta.upserted.filter(resource =>
          Object.hasOwn(props.aggregateSessionLock.models, resource.modelName),
        ),
        deleted: props.command.actorDelta.deleted.filter(resource =>
          Object.hasOwn(props.aggregateSessionLock.models, resource.modelName),
        ),
      },
    };
    return {
      ...command,
      admission: props.command.admission,
      execution: props.command.execution,
    };
  },
);
