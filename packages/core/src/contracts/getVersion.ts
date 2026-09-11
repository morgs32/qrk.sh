import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IContract } from './types.ts';

export function getVersion<CONTRACT extends IContract>(
  contract: CONTRACT,
  requestedVersion: string,
): Effect.Effect<
  NonNullable<CONTRACT['previous']>,
  ZerospinError<'contract-version-unsupported'>
>;
export function getVersion(contract: IContract, requestedVersion: string) {
  return Effect.fn('contracts.getVersion')(function* () {
    let selected = contract;
    while (selected.version !== requestedVersion) {
      if (selected.previous === undefined) {
        return yield* new ZerospinError({
          code: 'contract-version-unsupported',
          message: `Contract "${selected.commandName}" is version "${selected.version}", not "${requestedVersion}"`,
          extra: {
            commandName: selected.commandName,
            currentVersion: selected.version,
            requestedVersion,
          },
        });
      }
      selected = selected.previous;
    }
    return selected;
  })();
}
