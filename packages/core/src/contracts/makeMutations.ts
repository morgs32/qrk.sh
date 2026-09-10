import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import type { IAnyModels } from '../models/types.ts';

import { assertMutationsUseModels } from './assertMutationsUseModels.ts';
import type { IAnyMutation, ICommand, IContract } from './types.ts';

export const makeMutations = Effect.fn('makeMutations')(function* (props: {
  contract: IContract;
  models: IAnyModels;
  command: ICommand;
}): Effect.fn.Return<
  Readonly<{
    payload: unknown;
    mutations: readonly IAnyMutation[];
  }>,
  IAnyError,
  CuidFactory
> {
  const { contract, models, command } = props;

  const payload = yield* contract.validatePayload({
    version: contract.version,
    payload: command.payload,
  });
  const commandMutations = yield* contract.program({ payload });
  if (commandMutations === null || typeof commandMutations !== 'object') {
    return yield* new ZerospinError({
      code: 'contract-program-result-invalid',
      message: `Contract "${command.commandName}" must return a mutation, array, or record`,
    });
  }
  // Program result order is application order. This is the sole flattening boundary.
  const mutations = Array.isArray(commandMutations)
    ? commandMutations
    : commandMutations &&
        typeof commandMutations === 'object' &&
        'operationName' in commandMutations
      ? [commandMutations]
      : Object.values(commandMutations);

  yield* assertMutationsUseModels({
    mutations,
    models,
    commandName: command.commandName,
  });

  return {
    payload,
    mutations,
  };
});
