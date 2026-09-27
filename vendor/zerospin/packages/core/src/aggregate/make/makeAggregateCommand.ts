import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import { makeCommand } from '../../contracts/make/makeCommand.ts';
import type {
  IAggregateCommand,
  ICommand,
  IContract,
} from '../../contracts/types.ts';
import type {
  IAggregateId,
  InferCommandPayload,
  InferPayloadInput,
} from '../../models/types.ts';

export const makeAggregateCommand: <
  CONTRACT extends IContract,
  AGGREGATE_NAME extends string,
  const SYSTEM_NAME extends string,
>(props: {
  contract: CONTRACT;
  actorName: string;
  actorVersion: string;
  identity: Readonly<Record<string, unknown>>;
  aggregateId: IAggregateId;
  aggregateVersion: string;
  aggregateName: AGGREGATE_NAME;
  systemName: SYSTEM_NAME;
  payload: InferPayloadInput<CONTRACT['payload']>;
}) => Effect.Effect<
  Extract<
    IAggregateCommand<
      ICommand<
        CONTRACT['commandName'],
        CONTRACT['version'],
        InferCommandPayload<CONTRACT['payload']>
      >,
      AGGREGATE_NAME,
      SYSTEM_NAME
    >,
    { nodeId: null }
  >,
  IAnyError,
  CuidFactory
> = Effect.fn('makeAggregateCommand')(function* <
  CONTRACT extends IContract,
  AGGREGATE_NAME extends string,
  const SYSTEM_NAME extends string,
>(props: {
  contract: CONTRACT;
  actorName: string;
  actorVersion: string;
  identity: Readonly<Record<string, unknown>>;
  aggregateId: IAggregateId;
  aggregateVersion: string;
  aggregateName: AGGREGATE_NAME;
  systemName: SYSTEM_NAME;
  payload: InferPayloadInput<CONTRACT['payload']>;
}): Effect.fn.Return<
  Extract<
    IAggregateCommand<
      ICommand<
        CONTRACT['commandName'],
        CONTRACT['version'],
        InferCommandPayload<CONTRACT['payload']>
      >,
      AGGREGATE_NAME,
      SYSTEM_NAME
    >,
    { nodeId: null }
  >,
  IAnyError,
  CuidFactory
> {
  const {
    contract,
    aggregateId,
    aggregateName,
    payload,
    systemName,
    aggregateVersion,
    identity,
    actorName,
    actorVersion,
  } = props;

  const command = yield* makeCommand({
    contract,
    payload,
  });

  return {
    ...command,
    aggregateVersion,
    aggregateId,
    aggregateName,
    identity,
    actorName,
    actorVersion,
    nodeIndex: null,
    nodeId: null,
    sessionName: null,
    systemName,
  };
});
