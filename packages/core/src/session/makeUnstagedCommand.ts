import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeSessionCommand } from '../contracts/makeSessionCommand.ts';
import type {
  IContracts,
  InferCommand,
  IUnstagedCommand,
} from '../contracts/types.ts';
import type { InferPayloadInput } from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import type { ISessionId } from './types.ts';

export const makeUnstagedCommand = Effect.fn('makeUnstagedCommand')(function* <
  CONTRACTS extends IContracts,
  K extends keyof CONTRACTS & string,
>(
  props: {
    accountId: string;
    actorId: string;
    commandName: K;
    payload: InferPayloadInput<CONTRACTS[K]['payload']>;
    sessionId: ISessionId;
    systemVersion: string;
  } & (
    | {
        contracts: CONTRACTS;
        systemName: string;
        accountName: string;
        actorName: string;
        frontendName: string;
      }
    | {
        frontend: {
          contracts: CONTRACTS;
          systemName: string;
          accountName: string;
          actorName: string;
          frontendName: string;
        };
      }
  ),
): Effect.fn.Return<
  IUnstagedCommand<InferCommand<CONTRACTS[K]>>,
  IAnyError,
  CuidFactory
> {
  const {
    accountId,
    actorId,
    commandName,
    payload,
    sessionId,
    systemVersion,
  } = props;
  const { contracts, systemName, accountName, actorName, frontendName } =
    'frontend' in props ? props.frontend : props;

  const contract = yield* getByKeyOrThrow({
    record: contracts,
    key: commandName,
    recordKind: 'contracts',
  });

  const command = yield* makeSessionCommand({
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
  });

  const unstagedCommand: IUnstagedCommand<InferCommand<CONTRACTS[K]>> = {
    ...command,
    commandType: 'frontend',
    actorId,
    accountName,
    actorName,
    frontendName,
    stagedCursor: null,
    sessionId,
    status: null,
    stagedAt: null,
  };

  return unstagedCommand;
});
