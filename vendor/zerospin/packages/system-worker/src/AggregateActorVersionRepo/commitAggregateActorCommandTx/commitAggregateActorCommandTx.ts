import { Effect } from 'effect';

import { advanceExecutedHash } from '../../executedDispositionHash/executedDispositionHash.js';
import { commitActorProjectionTx } from '../commitActorProjectionTx/commitActorProjectionTx.js';

export const commitAggregateActorCommandTx = Effect.fn(
  'commitAggregateActorCommandTx',
)(function* (
  props: Omit<Parameters<typeof commitActorProjectionTx>[0], 'executedHash'> & {
    previousExecutedHash: string;
    disposition: 'success' | 'failure';
  },
) {
  const { previousExecutedHash, disposition, ...projection } = props;
  const executedHash = advanceExecutedHash({
    previousExecutedHash,
    disposition,
    executedIndex: projection.executedIndex,
    commandId: projection.commandId,
    failure:
      projection.admission?.status === 'failed'
        ? projection.admission.failure
        : projection.execution?.status === 'failed'
          ? projection.execution.failure
          : null,
  });
  return yield* commitActorProjectionTx({ ...projection, executedHash });
});
