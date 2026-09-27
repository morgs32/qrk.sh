import { createHash } from 'node:crypto';

import { type IFailure } from '@zerospin/core/contracts/failureCodec';
import { PublicFailureSchema } from '@zerospin/error';
import { Schema } from 'effect';

export const GENESIS_EXECUTED_PREIMAGE = 'zerospin.executed.disposition.v1';

/*
 * Empty selection history uses this deterministic seed for projection
 * checkpoints and WebSocket resume validation.
 *
 * 1. Hash the shared genesis preimage.
 */
export const genesisExecutedHash = (): string =>
  // 1 — use SHA-256 over genesisExecutedPreimage and return hexadecimal
  createHash('sha256').update(GENESIS_EXECUTED_PREIMAGE).digest('hex');

/*
 * Selection checkpoints extend the same tuple algorithm as aggregate and
 * service disposition hashes. Every consumed aggregate or service occurrence
 * advances the hash, including empty projected outputs.
 *
 * 1. Hash the next selection tuple.
 */
export const advanceExecutedHash = (props: {
  previousExecutedHash: string;
  executedIndex: number;
  commandId: string;
  disposition: 'success' | 'failure';
  failure: IFailure | null;
}): string => {
  const {
    executedIndex,
    commandId,
    disposition,
    previousExecutedHash,
    failure,
  } = props;

  // 1 — SHA-256 the JSON tuple [previousExecutedHash, executedIndex, commandId, disposition]
  return createHash('sha256')
    .update(
      JSON.stringify([
        previousExecutedHash,
        executedIndex,
        commandId,
        disposition,
        failure === null
          ? null
          : Schema.encodeSync(PublicFailureSchema)(failure),
      ]),
    )
    .digest('hex');
};
