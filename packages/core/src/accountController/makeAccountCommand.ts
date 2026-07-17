import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeCommand } from '../contracts/makeCommand.ts';
import type {
  IAccountCommand,
  ICommand,
  IContracts,
  ISessionId,
} from '../contracts/types.ts';
import type {
  InferCommandPayload,
  InferIdFromAbbreviation,
  InferPayloadInput,
  IPushedCursorId,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

export const makeAccountCommand = Effect.fn('makeAccountCommand')(function* <
  CONTRACTS extends IContracts,
  CONTRACT_NAME extends keyof CONTRACTS & string,
>(props: {
  contracts: CONTRACTS;
  contractName: CONTRACT_NAME;
  accountId: string;
  accountName: string;
  actorId?: InferIdFromAbbreviation | null;
  actorName?: string | null;
  sessionId?: ISessionId | null;
  frontendName?: string | null;
  pushedCursor?: IPushedCursorId | null;
  systemName: string;
  systemVersion: string;
  payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
}): Effect.fn.Return<
  IAccountCommand<
    ICommand<
      CONTRACTS[CONTRACT_NAME]['commandName'],
      CONTRACTS[CONTRACT_NAME]['version'],
      InferCommandPayload<CONTRACTS[CONTRACT_NAME]['payload']>
    >
  >,
  IAnyError,
  CuidFactory
> {
  const {
    actorId = null,
    actorName = null,
    contracts,
    contractName,
    accountId,
    accountName,
    payload,
    pushedCursor = null,
    sessionId = null,
    frontendName = null,
    systemName,
    systemVersion,
  } = props;

  const contract = yield* getByKeyOrThrow({
    record: contracts,
    key: contractName,
    recordKind: 'contracts',
  });
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
