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
  accountId: string;
  accountName: string;
  actorId: string;
  actorName: string;
  contract: CONTRACT;
  payload: InferPayloadInput<CONTRACT['payload']>;
  sessionId: ISessionId;
  frontendName: string;
  systemName: string;
  systemVersion: string;
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
    accountId,
    accountName,
    actorId,
    actorName,
    contract,
    payload,
    sessionId,
    frontendName,
    systemName,
    systemVersion,
  } = props;
  const command = yield* makeCommand({ contract, payload });

  return {
    ...command,
    accountId,
    accountName,
    actorId,
    actorName,
    pushedCursor: null,
    sessionId,
    frontendName,
    systemName,
    systemVersion,
  };
});
