import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ICommand, IContract, IEncodedCommand } from './types.ts';

export const decodeCommand = Effect.fn('decodeCommand')(function* <
  COMMAND extends ICommand,
>(props: {
  contract: IContract;
  command: IEncodedCommand<COMMAND>;
}): Effect.fn.Return<COMMAND, IAnyError> {
  const { contract, command } = props;
  const payload = yield* contract.decodePayload({
    command,
  });

  return {
    ...command,
    payload,
  } as COMMAND;
});
