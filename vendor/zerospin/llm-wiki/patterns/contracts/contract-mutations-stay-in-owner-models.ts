import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type { ICommand, IContract } from '@zerospin/core/contracts/types';
import type { IModels } from '@zerospin/core/models/types';
import { Effect } from 'effect';

/**
 * Pass the registry owner into contract execution so runtime mutation validation matches compile-time ownership.
 * `makeFrontendController` also applies `AssertContractsMutationsInModels` to its client-side contracts.
 *
 * @bad Let a service contract mutate an aggregate-only model and wait for persistence to fail.
 * @bad Validate only contract lookup; validate every produced mutation against the owner's model map too.
 */
export const runAggregateContract = Effect.fn('runAggregateContract')(
  function* (props: {
    command: ICommand;
    contract: IContract;
    models: IModels;
  }) {
    return yield* makeMutations({
      command: props.command,
      contract: props.contract,
      models: props.models,
      owner: { kind: 'aggregate' },
    });
  },
);

export const runServiceContract = Effect.fn('runServiceContract')(
  function* (props: {
    command: ICommand;
    contract: IContract;
    models: IModels;
    serviceName: string;
  }) {
    return yield* makeMutations({
      command: props.command,
      contract: props.contract,
      models: props.models,
      owner: { kind: 'service', serviceName: props.serviceName },
    });
  },
);
