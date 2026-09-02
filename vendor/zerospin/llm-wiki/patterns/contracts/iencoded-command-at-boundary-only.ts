import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import type {
  IAggregateCommand,
  IContract,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { Effect } from 'effect';

/**
 * Execute decoded domain commands, but persist and transport the complete encoded command on every chain occurrence.
 *
 * @bad Parse encoded payload bytes repeatedly inside authored execution.
 * @bad Rebuild a terminal occurrence from a hand-picked field subset.
 * @bad Use a storage row as the chain, outbox, WebSocket, or browser-journal contract.
 */
export const encodeForAdmission = Effect.fn('encodeForAdmission')(
  function* (props: {
    command: IAggregateCommand;
    contract: IContract;
    insert(command: IEncodedCommand<IAggregateCommand>): void;
  }) {
    const encodedCommand = yield* encodeCommand({
      command: props.command,
      contract: props.contract,
    });

    props.insert(encodedCommand);
    return encodedCommand;
  },
);
