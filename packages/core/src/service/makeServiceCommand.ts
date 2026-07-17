import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeCommand } from '../contracts/makeCommand.ts';
import type {
  ICommand,
  IContracts,
  IServiceCommand,
} from '../contracts/types.ts';
import type {
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

export const makeServiceCommand = Effect.fn('makeServiceCommand')(function* <
  CONTRACTS extends IContracts,
  CONTRACT_NAME extends keyof CONTRACTS & string,
>(props: {
  contracts: CONTRACTS;
  serviceName: string;
  systemVersion: string;
  contractName: CONTRACT_NAME;
  payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
}): Effect.fn.Return<
  IServiceCommand<
    ICommand<
      CONTRACTS[CONTRACT_NAME]['commandName'],
      CONTRACTS[CONTRACT_NAME]['version'],
      InferCommandPayload<CONTRACTS[CONTRACT_NAME]['payload']>
    >
  >,
  IAnyError,
  CuidFactory
> {
  const { contracts, serviceName, systemVersion, contractName, payload } =
    props;

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
    commandType: 'service',
    serviceName,
    systemVersion,
  };
});
