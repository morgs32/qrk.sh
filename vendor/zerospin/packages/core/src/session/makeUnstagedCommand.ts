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
    aggregateId: string;
    userId: string;
    commandName: K;
    payload: InferPayloadInput<CONTRACTS[K]['payload']>;
    sessionId: ISessionId;
  } & (
    | {
        contracts: CONTRACTS;
        systemName: string;
        aggregateName: string;
        frontendName: string;
      }
    | {
        frontend: {
          contracts: CONTRACTS;
          systemName: string;
          aggregateName: string;
          frontendName: string;
        };
      }
  ),
): Effect.fn.Return<
  IUnstagedCommand<InferCommand<CONTRACTS[K]>>,
  IAnyError,
  CuidFactory
> {
  const { aggregateId, userId, commandName, payload, sessionId } = props;
  const { contracts, systemName, aggregateName, frontendName } =
    'frontend' in props ? props.frontend : props;

  const contract = yield* getByKeyOrThrow({
    record: contracts,
    key: commandName,
    recordKind: 'contracts',
  });

  const command = yield* makeSessionCommand({
    aggregateId,
    aggregateName,
    userId,
    contract,
    payload,
    sessionId,
    frontendName,
    systemName,
  });

  const unstagedCommand: IUnstagedCommand<InferCommand<CONTRACTS[K]>> = {
    ...command,
    commandType: 'frontend',
    userId,
    aggregateName,
    frontendName,
    stagedCursor: null,
    sessionId,
    status: null,
    stagedAt: null,
  };

  return unstagedCommand;
});
