import { createHash } from 'node:crypto';
export const GENESIS_DISPOSITION_PREIMAGE = 'zerospin.service.disposition.v1';

/*
 * Empty service history uses this deterministic seed for execution,
 * publication validation, and cutover checkpoint comparison.
 *
 * 1. Hash the shared genesis preimage.
 */
export const genesisDispositionHash = (): string =>
  // 1 — use SHA-256 over GENESIS_DISPOSITION_PREIMAGE and return hexadecimal
  createHash('sha256').update(GENESIS_DISPOSITION_PREIMAGE).digest('hex');

/*
 * Version-owned execution and retained-history validation extend the same
 * disposition hash. The hash includes the previous prefix, service position,
 * command ID, and terminal success/failure in a fixed tuple order.
 *
 * 1. Hash the next disposition tuple.
 */
export const advanceDispositionHash = (props: {
  previousDispositionHash: string;
  serviceIndex: number;
  commandId: string;
  disposition: 'success' | 'failure';
}): string => {
  const { serviceIndex, commandId, disposition, previousDispositionHash } =
    props;

  // 1 — SHA-256 the JSON tuple [previousDispositionHash, serviceIndex, commandId, disposition]
  return createHash('sha256')
    .update(
      JSON.stringify([
        previousDispositionHash,
        serviceIndex,
        commandId,
        disposition,
      ]),
    )
    .digest('hex');
};
