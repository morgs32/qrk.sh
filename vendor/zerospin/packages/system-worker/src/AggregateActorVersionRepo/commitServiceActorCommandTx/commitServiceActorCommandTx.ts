import { Effect } from 'effect';

import { advanceExecutedHash } from '../../executedDispositionHash/executedDispositionHash.js';
import { commitActorProjectionTx } from '../commitActorProjectionTx/commitActorProjectionTx.js';

export const commitServiceActorCommandTx = Effect.fn(
  'commitServiceActorCommandTx',
)(function* (
  props: Omit<
    Parameters<typeof commitActorProjectionTx>[0],
    | 'executedHash'
    | 'ownerIdentity'
    | 'ownerSessionName'
    | 'nodeId'
    | 'nodeIndex'
  > & { previousExecutedHash: string; disposition: 'success' | 'failure' },
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
  return yield* commitActorProjectionTx({
    ...projection,
    admission: null,
    execution: null,
    nodeId: null,
    nodeIndex: null,
    ownerIdentity: null,
    ownerSessionName: null,
    executedHash,
  });
});
