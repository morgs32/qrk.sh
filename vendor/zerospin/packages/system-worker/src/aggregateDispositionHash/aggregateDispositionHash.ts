import { createHash } from 'node:crypto';

import { type IFailure } from '@zerospin/core/contracts/failureCodec';
import { PublicFailureSchema } from '@zerospin/error';
import { Schema } from 'effect';
export const GENESIS_DISPOSITION_PREIMAGE = 'zerospin.aggregate.disposition.v1';

/*
 * Empty aggregate history uses this deterministic seed for execution,
 * publication validation, and cutover checkpoint comparison.
 *
 * 1. Hash the shared genesis preimage.
 */
export const genesisDispositionHash = (): string =>
  // 1 — use SHA-256 over genesisDispositionPreimage and return hexadecimal
  createHash('sha256').update(GENESIS_DISPOSITION_PREIMAGE).digest('hex');

/*
 * Version-owned execution and retained-history validation extend the same
 * disposition hash. The hash includes the previous prefix, aggregate position,
 * command ID, terminal success/failure, and original retained failure in a fixed tuple order.
 *
 * 1. Hash the next disposition tuple.
 */
export const advanceDispositionHash = (props: {
  previousDispositionHash: string;
  aggregateIndex: number;
  commandId: string;
  disposition: 'success' | 'failure';
  failure: IFailure | null;
}): string => {
  const {
    aggregateIndex,
    commandId,
    disposition,
    previousDispositionHash,
    failure,
  } = props;

  // 1 — SHA-256 the JSON tuple [previousDispositionHash, aggregateIndex, commandId, disposition]
  return createHash('sha256')
    .update(
      JSON.stringify([
        previousDispositionHash,
        aggregateIndex,
        commandId,
        disposition,
        failure === null
          ? null
          : Schema.encodeSync(PublicFailureSchema)(failure),
      ]),
    )
    .digest('hex');
};
