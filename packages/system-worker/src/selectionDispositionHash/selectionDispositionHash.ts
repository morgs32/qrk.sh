import { createHash } from 'node:crypto';

export const GENESIS_SELECTION_PREIMAGE = 'zerospin.selection.disposition.v1';

/*
 * Empty selection history uses this deterministic seed for projection
 * checkpoints and WebSocket resume validation.
 *
 * 1. Hash the shared genesis preimage.
 */
export const genesisSelectionHash = (): string =>
  // 1 — use SHA-256 over GENESIS_SELECTION_PREIMAGE and return hexadecimal
  createHash('sha256').update(GENESIS_SELECTION_PREIMAGE).digest('hex');

/*
 * Selection checkpoints extend the same tuple algorithm as aggregate and
 * service disposition hashes. Every consumed aggregate or service occurrence
 * advances the hash, including empty projected outputs.
 *
 * 1. Hash the next selection tuple.
 */
export const advanceSelectionHash = (props: {
  previousSelectionHash: string;
  selectionIndex: number;
  commandId: string;
  disposition: 'success' | 'failure';
}): string => {
  const { selectionIndex, commandId, disposition, previousSelectionHash } =
    props;

  // 1 — SHA-256 the JSON tuple [previousSelectionHash, selectionIndex, commandId, disposition]
  return createHash('sha256')
    .update(
      JSON.stringify([
        previousSelectionHash,
        selectionIndex,
        commandId,
        disposition,
      ]),
    )
    .digest('hex');
};
