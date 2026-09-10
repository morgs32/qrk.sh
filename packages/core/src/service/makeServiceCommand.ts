import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import { makeCommand } from '../contracts/makeCommand.ts';
import type {
  IAnyContracts,
  ICommand,
  IServiceCommand,
} from '../contracts/types.ts';
import type {
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

export const makeServiceCommand = Effect.fn('makeServiceCommand')(function* <
  SERVICE_NAME extends string,
  CONTRACTS extends IAnyContracts,
  CONTRACT_NAME extends keyof CONTRACTS & string,
>(props: {
  contracts: CONTRACTS;
  serviceVersion: string;
  serviceName: SERVICE_NAME;
  contractName: CONTRACT_NAME;
  payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
}): Effect.fn.Return<
  IServiceCommand<
    ICommand<
      CONTRACTS[CONTRACT_NAME]['commandName'],
      CONTRACTS[CONTRACT_NAME]['version'],
      InferCommandPayload<CONTRACTS[CONTRACT_NAME]['payload']>
    >,
    SERVICE_NAME
  >,
  IAnyError,
  CuidFactory
> {
  const { contracts, serviceName, contractName, payload } = props;

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
    serviceVersion: props.serviceVersion,
    serviceName,
  };
});
