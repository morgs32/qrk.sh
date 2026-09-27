import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { runProgram } from '../../execution/runProgram.ts';
import type { IAnyModels } from '../../models/types.ts';
import { assertMutationsUseModels } from '../assertMutationsUseModels.ts';
import { validateFailure } from '../failureCodec.ts';
import type {
  IAnyMutation,
  ICommand,
  IContract,
  IContractFailure,
  InferFailure,
} from '../types.ts';
import { validatePayload } from '../validatePayload.ts';

export function makeMutations<CONTRACT extends IContract>(props: {
  contract: CONTRACT;
  models: IAnyModels;
  command: ICommand;
  identity: Readonly<Record<string, unknown>> | null;
}): Effect.Effect<
  Readonly<{
    payload: unknown;
    mutations: readonly IAnyMutation[];
  }>,
  IAnyError | InferFailure<CONTRACT>,
  Effect.Services<ReturnType<CONTRACT['program']>>
>;
export function makeMutations(props: {
  contract: IContract;
  models: IAnyModels;
  command: ICommand;
  identity: Readonly<Record<string, unknown>> | null;
}) {
  return make(props);
}
const make = Effect.fn('makeMutations')(function* (props: {
  contract: IContract;
  models: IAnyModels;
  command: ICommand;
  identity: Readonly<Record<string, unknown>> | null;
}): Effect.fn.Return<
  Readonly<{
    payload: unknown;
    mutations: readonly IAnyMutation[];
  }>,
  IContractFailure,
  CuidFactory | unknown
> {
  const { contract, models, command, identity: inputIdentity } = props;

  const payload = yield* validatePayload(contract, {
    version: contract.version,
    payload: command.payload,
  });
  const identity =
    contract.identity === undefined
      ? inputIdentity
      : yield* runProgram(
          Schema.decodeUnknownEffect(Schema.toType(contract.identity))(
            inputIdentity,
          ).pipe(
            mapParseError({
              code: 'contract-identity-invalid',
              prefix: 'Invalid contract identity',
            }),
          ),
        );
  const commandMutations = yield* runProgram(
    contract.program({
      payload,
      identity,
    }),
  ).pipe(
    Effect.catch(failure =>
      isZerospinError(failure) && !('scope' in failure)
        ? Effect.fail(failure)
        : validateFailure(contract, failure, 'contract').pipe(
            Effect.flatMap(Effect.fail),
          ),
    ),
  );
  if (!Array.isArray(commandMutations)) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'contract-program-result-invalid',
        message: `Contract "${command.commandName}" must return an array of mutations`,
      }),
    );
  }
  const mutations = commandMutations;

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
