import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { ICommand, IContract, IEncodedCommand } from './types.ts';

export const encodeCommand = Effect.fn('encodeCommand')(function* <
  COMMAND extends ICommand,
>(props: {
  contract: IContract;
  command: COMMAND;
}): Effect.fn.Return<IEncodedCommand<COMMAND>, IAnyError> {
  const { contract, command } = props;
  const payload = yield* contract.encodePayload({
    payload: command.payload,
  });

  return {
    ...command,
    payload,
  };
});
