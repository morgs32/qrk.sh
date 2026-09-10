import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type { ICommand, IContract } from '@zerospin/core/contracts/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { Effect } from 'effect';

/**
 * Pass the registered models into contract execution; validate exact model membership and replica operation compatibility.
 * `makeFrontendController` also applies `AssertContractMutationsInModels` to its client-side contracts.
 *
 * @bad Let a service contract mutate an aggregate-only model and wait for persistence to fail.
 * @bad Validate only contract lookup; validate every produced mutation against the owner's model map too.
 */
export const runAggregateContract = Effect.fn('runAggregateContract')(
  function* (props: {
    command: ICommand;
    contract: IContract;
    models: IAnyModels;
  }) {
    return yield* makeMutations({
      command: props.command,
      contract: props.contract,
      models: props.models,
    });
  },
);

export const runServiceContract = Effect.fn('runServiceContract')(
  function* (props: {
    command: ICommand;
    contract: IContract;
    models: IAnyModels;
  }) {
    return yield* makeMutations({
      command: props.command,
      contract: props.contract,
      models: props.models,
    });
  },
);
