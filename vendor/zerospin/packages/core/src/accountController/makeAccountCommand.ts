import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeCommand } from '../contracts/makeCommand.ts';
import type {
  IAccountCommand,
  ICommand,
  IContract,
  ISessionId,
} from '../contracts/types.ts';
import type {
  InferCommandPayload,
  InferIdFromAbbreviation,
  InferPayloadInput,
  IPushedCursorId,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

export const makeAccountCommand = Effect.fn('makeAccountCommand')(function* <
  CONTRACT extends IContract,
>(props: {
  contract: CONTRACT;
  accountId: string;
  accountName: string;
  actorId?: InferIdFromAbbreviation | null;
  actorName?: string | null;
  sessionId?: ISessionId | null;
  frontendName?: string | null;
  pushedCursor?: IPushedCursorId | null;
  systemName: string;
  systemVersion: string;
  payload: InferPayloadInput<CONTRACT['payload']>;
}): Effect.fn.Return<
  IAccountCommand<
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
    actorId = null,
    actorName = null,
    contract,
    accountId,
    accountName,
    payload,
    pushedCursor = null,
    sessionId = null,
    frontendName = null,
    systemName,
    systemVersion,
  } = props;

  const command = yield* makeCommand({
    contract,
    payload,
  });

  return {
    ...command,
    commandType: 'account',
    accountId,
    accountName,
    actorId,
    actorName,
    pushedCursor,
    sessionId,
    frontendName,
    systemName,
    systemVersion,
  };
});
