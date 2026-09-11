import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import type { IAnyAuthoredAggregate } from './aggregate/types.ts';
import { makeCommand as makeContractCommand } from './contracts/makeCommand.ts';
import type {
  IAggregateCommand,
  ICommand,
  IServiceCommand,
} from './contracts/types.ts';
import type {
  IAggregateId,
  InferCommandPayload,
  InferPayloadInput,
} from './models/types.ts';
import type { IAnyService } from './service/types.ts';
import { getByKeyOrThrow } from './utils/getByKeyOrThrow.ts';

export function makeCommand<
  SERVICE extends IAnyService,
  CONTRACT_NAME extends keyof SERVICE['contracts'] & string,
>(
  service: SERVICE,
  props: {
    contractName: CONTRACT_NAME;
    payload: NoInfer<
      InferPayloadInput<SERVICE['contracts'][CONTRACT_NAME]['payload']>
    >;
  },
): Effect.Effect<
  IServiceCommand<
    ICommand<
      SERVICE['contracts'][CONTRACT_NAME]['commandName'],
      SERVICE['contracts'][CONTRACT_NAME]['version'],
      InferCommandPayload<SERVICE['contracts'][CONTRACT_NAME]['payload']>
    >,
    SERVICE['name']
  >,
  IAnyError,
  CuidFactory
>;
export function makeCommand<
  AGGREGATE extends IAnyAuthoredAggregate,
  CONTRACT_NAME extends keyof AGGREGATE['contracts'] & string,
  const SYSTEM_NAME extends string,
>(
  aggregate: AGGREGATE,
  props: {
    contractName: CONTRACT_NAME;
    aggregateId: IAggregateId;
    systemName: SYSTEM_NAME;
    payload: NoInfer<
      InferPayloadInput<
        AGGREGATE['contracts'][CONTRACT_NAME]['contract']['payload']
      >
    >;
  },
): Effect.Effect<
  Extract<
    IAggregateCommand<
      ICommand<
        AGGREGATE['contracts'][CONTRACT_NAME]['contract']['commandName'],
        AGGREGATE['contracts'][CONTRACT_NAME]['contract']['version'],
        InferCommandPayload<
          AGGREGATE['contracts'][CONTRACT_NAME]['contract']['payload']
        >
      >,
      AGGREGATE['name'],
      SYSTEM_NAME
    >,
    { sessionId: null }
  >,
  IAnyError,
  CuidFactory
>;
export function makeCommand(
  owner: IAnyService | IAnyAuthoredAggregate,
  props: {
    contractName: string;
    payload: InferPayloadInput<IAnyService['contracts'][string]['payload']>;
    aggregateId?: IAggregateId;
    systemName?: string;
  },
): Effect.Effect<unknown, IAnyError, CuidFactory> {
  return Effect.gen(function* () {
    const selected = yield* getByKeyOrThrow({
      record: owner.contracts,
      key: props.contractName,
      recordKind: 'contracts',
    });
    const contract = 'contract' in selected ? selected.contract : selected;
    const command = yield* makeContractCommand({
      contract,
      payload: props.payload,
    });
    if ('contract' in selected) {
      return {
        ...command,
        aggregateVersion: owner.version,
        aggregateId: props.aggregateId,
        aggregateName: owner.name,
        identityKey: null,
        pushIndex: null,
        sessionId: null,
        frontendName: null,
        systemName: props.systemName,
      };
    }
    return {
      ...command,
      serviceVersion: owner.version,
      serviceName: owner.name,
    };
  });
}
