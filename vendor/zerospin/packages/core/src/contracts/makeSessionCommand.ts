import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type {
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

import { makeCommand } from './makeCommand.ts';
import type {
  ICommand,
  IContract,
  ISessionCommand,
  ISessionId,
} from './types.ts';

export const makeSessionCommand = Effect.fn('makeSessionCommand')(function* <
  CONTRACT extends IContract,
>(props: {
  aggregateId: string;
  aggregateName: string;
  userId: string;
  contract: CONTRACT;
  payload: InferPayloadInput<CONTRACT['payload']>;
  sessionId: ISessionId;
  frontendName: string;
  systemName: string;
}): Effect.fn.Return<
  ISessionCommand<
    ICommand<
      CONTRACT['commandName'],
      CONTRACT['version'],
      InferCommandPayload<CONTRACT['payload']>
    >
  >,
  IAnyError,
  CuidFactory
> {
  const {
    aggregateId,
    aggregateName,
    userId,
    contract,
    payload,
    sessionId,
    frontendName,
    systemName,
  } = props;
  const command = yield* makeCommand({ contract, payload });

  return {
    ...command,
    aggregateId,
    aggregateName,
    userId,
    pushedCursor: null,
    sessionId,
    frontendName,
    systemName,
  };
});
