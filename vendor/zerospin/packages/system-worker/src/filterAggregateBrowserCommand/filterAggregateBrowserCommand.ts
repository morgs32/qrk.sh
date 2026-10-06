import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateBrowserCommand } from '@zerospin/core/aggregateSession/types';
import { Effect } from 'effect';

/** Explicitly construct the browser command and its occurrence checkpoint. */
export const filterAggregateBrowserCommand = Effect.fn(
  'filterAggregateBrowserCommand',
)(function* (props: {
  aggregateName: string;
  aggregateVersion: string;
  aggregateSessionLock: IAggregateSessionLock;
  output: IAggregateBrowserCommand;
}) {
  const { output, aggregateSessionLock: lock } = props;
  return {
    executedIndex: output.executedIndex,
    aggregateIndex: output.aggregateIndex,
    executedHash: output.executedHash,
    id: output.id,
    commandName: output.commandName,
    admission: output.admission,
    execution: output.execution,
    delta: {
      upserted: output.delta.upserted.filter(resource =>
        Object.hasOwn(lock.models, resource.modelName),
      ),
      deleted: output.delta.deleted.filter(resource =>
        Object.hasOwn(lock.models, resource.modelName),
      ),
    },
  };
});
