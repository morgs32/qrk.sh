import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IModels } from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

import { assertMutationsUseModels } from './assertMutationsUseModels.ts';
import type { IAnyMutation, ICommand, IContract } from './types.ts';

export const makeMutations = Effect.fn('makeMutations')(function* (props: {
  contract: IContract;
  models: IModels;
  owner: { kind: 'account' } | { kind: 'service'; serviceName: string };
  command: ICommand;
}): Effect.fn.Return<
  Readonly<{
    payload: unknown;
    mutations: readonly IAnyMutation[];
  }>,
  IAnyError,
  CuidFactory
> {
  const { contract, models, owner, command } = props;

  const payload = yield* contract.validatePayload({
    payload: command.payload,
  });
  const commandMutations = yield* contract.program({ payload });
  const validatedMutations =
    contract.mutations === null
      ? {}
      : yield* Schema.validate(contract.mutations)(commandMutations, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'validate-contract-mutations-failed',
            prefix: `Contract "${command.commandName}" program output did not match its mutations schema`,
            extra: { commandName: command.commandName },
          }),
        );

  // The contract declaration owns application order. Arrays and tuples already
  // carry that order; structs preserve their declaration order through the
  // decoded object's property order. This is the sole flattening boundary.
  const mutations = Array.isArray(validatedMutations)
    ? validatedMutations
    : validatedMutations &&
        typeof validatedMutations === 'object' &&
        'operationName' in validatedMutations
      ? [validatedMutations]
      : Object.values(validatedMutations);

  yield* assertMutationsUseModels({
    mutations,
    models,
    owner,
    commandName: command.commandName,
  });

  return {
    payload,
    mutations,
  };
});
