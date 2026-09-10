import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Effect } from 'effect';

import { Model } from '../models/makeModel.ts';
import type { IAnyModels, IModel, IModelReplica } from '../models/types.ts';

import type { MutationValues } from './makeVersion.ts';
import type { IAnyContracts, IAnyMutation, IContract } from './types.ts';

type InferContractMutations<CONTRACT extends IContract> = Effect.Success<
  ReturnType<CONTRACT['program']>
>;

type InferContractReturnedMutations<CONTRACT extends IContract> =
  MutationValues<InferContractMutations<CONTRACT>>;

export const assertMutationsUseModels = Effect.fn('assertMutationsUseModels')(
  function* (props: {
    mutations: readonly IAnyMutation[];
    models: IAnyModels;
    commandName: string;
  }): Effect.fn.Return<void, IAnyError> {
    const { mutations, models, commandName } = props;

    for (const mutation of mutations) {
      if (
        mutation === null ||
        typeof mutation !== 'object' ||
        !(mutation.model instanceof Model) ||
        mutation.modelVersion !== mutation.model.version ||
        !['create', 'update', 'delete', 'move', 'replicate'].includes(
          mutation.operationName,
        )
      ) {
        return yield* new ZerospinError({
          code: 'contract-program-mutation-invalid',
          message: `Contract "${commandName}" must return mutations bound to their exact model version`,
        });
      }
      const modelName = mutation.model.modelName;
      const controllerModel = models[modelName];
      if (controllerModel !== mutation.model) {
        return yield* new ZerospinError({
          code: 'contract-mutation-model-out-of-scope',
          message: `Contract "${commandName}" emitted a mutation for model "${modelName}" outside the passed controller models`,
          extra: {
            commandName,
            modelName,
          },
        });
      }

      const isReplica = Model.isReplica(mutation.model);
      if ((mutation.operationName === 'replicate') === isReplica) {
        continue;
      }

      return yield* new ZerospinError({
        code: 'contract-mutation-model-operation-mismatch',
        message: `Contract "${commandName}" emitted ${mutation.operationName} for model "${modelName}" with an operation incompatible with that model`,
        extra: { commandName, modelName },
      });
    }
  },
);

export type AssertMutationModelInModels<MUTATION, MODELS extends IAnyModels> = [
  MUTATION,
] extends [never]
  ? MODELS
  : MUTATION extends {
        readonly operationName: 'replicate';
        readonly model: infer MODEL extends IModel;
      }
    ? MODEL extends IModelReplica
      ? string extends MODEL['modelName']
        ? MODELS
        : MODEL['modelName'] extends keyof MODELS & string
          ? MODELS[MODEL['modelName']] extends MODEL
            ? MODEL extends MODELS[MODEL['modelName']]
              ? MODELS
              : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
            : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
          : ITypeError<`mutation model "${MODEL['modelName']}" is not registered on controller models`>
      : ITypeError<'replicate requires a model replica'>
    : MUTATION extends { readonly model: infer MODEL extends IModel }
      ? MODEL extends IModelReplica
        ? ITypeError<`model replica "${MODEL['modelName']}" can only use replicate`>
        : string extends MODEL['modelName']
          ? MODELS
          : MODEL['modelName'] extends keyof MODELS & string
            ? MODELS[MODEL['modelName']] extends MODEL
              ? MODEL extends MODELS[MODEL['modelName']]
                ? MODELS
                : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
              : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
            : ITypeError<`mutation model "${MODEL['modelName']}" is not registered on controller models`>
      : ITypeError<'contract program returned a non-mutation'>;

export type AssertContractMutationsInModels<
  CONTRACT extends IContract,
  MODELS extends IAnyModels,
> =
  AssertMutationModelInModels<
    InferContractReturnedMutations<CONTRACT>,
    MODELS
  > extends infer RESULT
    ? Exclude<RESULT, MODELS> extends never
      ? CONTRACT
      : Exclude<RESULT, MODELS> extends ITypeError<infer MESSAGE>
        ? ITypeError<`Contract "${CONTRACT['commandName']}" ${MESSAGE}`>
        : Exclude<RESULT, MODELS>
    : never;

export type AssertContractsMutationsInModels<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
> = [keyof CONTRACTS & string] extends [never]
  ? CONTRACTS
  : {
        [K in keyof CONTRACTS & string]: AssertContractMutationsInModels<
          CONTRACTS[K],
          MODELS
        >;
      }[keyof CONTRACTS & string] extends infer RESULT
    ? Exclude<RESULT, CONTRACTS[keyof CONTRACTS & string]> extends never
      ? CONTRACTS
      : Exclude<RESULT, CONTRACTS[keyof CONTRACTS & string]>
    : never;
