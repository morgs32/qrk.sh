import { Effect } from 'effect';

import type { ICommand, IContract } from './types.ts';

export const encodeCommand = Effect.fn('encodeCommand')(function* <
  COMMAND extends ICommand,
>(props: { contract: IContract; command: COMMAND }) {
  const { contract, command } = props;
  const payload = yield* contract.encodePayload({
    version: command.contractVersion,
    payload: command.payload,
  });
  const { payload: _payload, ...commandFields } = command;

  return {
    ...commandFields,
    payload,
  };
});
