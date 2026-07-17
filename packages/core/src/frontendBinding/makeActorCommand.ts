import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeCommand } from '../contracts/makeCommand.ts';
import type {
  IActorCommand,
  ICommand,
  IContracts,
} from '../contracts/types.ts';
import type {
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

export const makeActorCommand = Effect.fn('makeActorCommand')(function* <
  CONTRACTS extends IContracts,
  CONTRACT_NAME extends keyof CONTRACTS & string,
>(props: {
  contracts: CONTRACTS;
  accountName: string;
  actorName: string;
  frontendName: string;
  systemName: string;
  systemVersion: string;
  contractName: CONTRACT_NAME;
  accountId: string;
  actorId: string;
  payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
}): Effect.fn.Return<
  IActorCommand<
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
    contracts,
    accountName,
    actorName,
    frontendName,
    systemName,
    systemVersion,
    contractName,
    accountId,
    actorId,
    payload,
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
    commandType: 'actor',
    accountId,
    accountName,
    actorId,
    actorName,
    pushedCursor: null,
    sessionId: null,
    frontendName,
    systemName,
    systemVersion,
  };
});
