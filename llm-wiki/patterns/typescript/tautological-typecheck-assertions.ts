import type { IChainedCommand } from '@zerospin/core/contracts/types';
import type { IEncodedResult } from '@zerospin/error';
import { assert, type Equals } from 'tsafe';

/**
 * Assert explicit public contract in typecheck tests — not ReturnType reflexivity.
 *
 * @bad assert<Equals<typeof promise, ReturnType<typeof fn>>> right after calling fn.
 */
const finalizeListPromise =
  systemApi.executeAggregateCommand(encodedListCommand);

assert<
  Equals<
    typeof finalizeListPromise,
    Promise<IEncodedResult<IChainedCommand, unknown>>
  >
>();

declare const systemApi: {
  executeAggregateCommand: (command: unknown) => Promise<unknown>;
};
declare const encodedListCommand: unknown;
